"""Margined's own billing — Stripe Checkout, customer portal, plan webhook."""

from typing import Annotated, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import get_current_user
from app.config import settings
from app.database import get_db

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]

PLAN_LIMITS: dict[str, Optional[int]] = {
    "free": 100_000,
    "starter": 1_000_000,
    "growth": None,  # unlimited
}


def _get_stripe():
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Billing not configured")
    stripe.api_key = settings.stripe_secret_key
    return stripe


def _price_for(plan: str) -> str:
    price = {
        "starter": settings.stripe_price_starter,
        "growth": settings.stripe_price_growth,
    }.get(plan, "")
    if not price:
        raise HTTPException(status_code=400, detail="Unknown plan")
    return price


def get_account(user_id: str) -> dict:
    db = get_db()
    try:
        result = db.table("billing_accounts").select("*").eq("user_id", user_id).limit(1).execute()
        if result.data:
            return result.data[0]
    except Exception:
        pass
    return {"user_id": user_id, "plan": "free", "stripe_customer": None}


@router.get("/status")
def billing_status(user: User):
    """Current plan, limit, and month-to-date event usage across projects."""
    account = get_account(user["id"])
    db = get_db()
    from datetime import date

    month = date.today().strftime("%Y-%m")
    used = 0
    try:
        projects = db.table("projects").select("id").eq("user_id", user["id"]).execute()
        ids = [p["id"] for p in (projects.data or [])]
        if ids:
            counters = (
                db.table("usage_counters")
                .select("events")
                .in_("project_id", ids)
                .eq("month", month)
                .execute()
            )
            used = sum(int(c["events"]) for c in (counters.data or []))
    except Exception:
        pass
    plan = account.get("plan", "free")
    return {
        "plan": plan,
        "events_used": used,
        "events_limit": PLAN_LIMITS.get(plan),
        "month": month,
    }


@router.post("/checkout")
def create_checkout(body: dict, user: User):
    """Create a Stripe Checkout session for a plan upgrade."""
    _get_stripe()
    plan = body.get("plan", "")
    price = _price_for(plan)
    account = get_account(user["id"])

    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": price, "quantity": 1}],
        customer=account.get("stripe_customer") or None,
        customer_email=None if account.get("stripe_customer") else user.get("email"),
        client_reference_id=user["id"],
        metadata={"user_id": user["id"], "plan": plan},
        success_url=f"{settings.frontend_url}/settings?billing=success",
        cancel_url=f"{settings.frontend_url}/settings?billing=cancelled",
    )
    return {"url": session.url}


@router.post("/portal")
def customer_portal(user: User):
    """Stripe customer portal for managing/cancelling the subscription."""
    _get_stripe()
    account = get_account(user["id"])
    if not account.get("stripe_customer"):
        raise HTTPException(status_code=400, detail="No billing account yet")
    session = stripe.billing_portal.Session.create(
        customer=account["stripe_customer"],
        return_url=f"{settings.frontend_url}/settings",
    )
    return {"url": session.url}


@router.post("/webhook")
async def billing_webhook(request: Request):
    """Stripe webhook: keep billing_accounts.plan in sync with subscriptions."""
    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(
            payload, signature, settings.stripe_billing_webhook_secret
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    db = get_db()

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
        plan = session.get("metadata", {}).get("plan", "starter")
        if user_id and plan in PLAN_LIMITS:
            db.table("billing_accounts").upsert({
                "user_id": user_id,
                "plan": plan,
                "stripe_customer": session.get("customer"),
                "stripe_subscription": session.get("subscription"),
            }).execute()

    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        db.table("billing_accounts").update({
            "plan": "free",
            "stripe_subscription": None,
        }).eq("stripe_customer", sub.get("customer")).execute()

    return {"received": True}
