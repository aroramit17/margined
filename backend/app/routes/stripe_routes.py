"""Stripe integration — OAuth connect, MRR sync, customer mapping."""

from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import get_current_user, require_project_access
from app.config import settings
from app.database import get_db
from app.models.schemas import StripeCustomerMap

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]


def _get_stripe():
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    stripe.api_key = settings.stripe_secret_key
    return stripe


@router.get("/connect/{project_id}")
def get_connect_url(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    """Return a Stripe OAuth Connect URL for the project."""
    _get_stripe()
    url = (
        "https://connect.stripe.com/oauth/authorize"
        "?response_type=code"
        f"&client_id={settings.stripe_client_id if hasattr(settings, 'stripe_client_id') else ''}"
        f"&scope=read_only"
        f"&state={project_id}"
    )
    return {"url": url}


@router.post("/customers/{project_id}/map", response_model=StripeCustomerMap)
def map_customer(
    project_id: str,
    body: StripeCustomerMap,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    """Manually link an SDK user_id to a Stripe customer ID."""
    _get_stripe()

    # Fetch MRR from Stripe
    mrr = None
    plan_name = None
    try:
        subscriptions = stripe.Subscription.list(customer=body.stripe_customer, limit=1)
        if subscriptions.data:
            sub = subscriptions.data[0]
            mrr = sub.plan.amount / 100  # cents to dollars
            plan_name = sub.plan.nickname or sub.plan.product
    except Exception:
        pass

    db = get_db()
    db.table("stripe_customers").upsert({
        "project_id": project_id,
        "customer_id": body.customer_id,
        "stripe_customer": body.stripe_customer,
        "current_mrr_usd": mrr,
        "plan_name": plan_name,
    }).execute()

    return StripeCustomerMap(
        customer_id=body.customer_id,
        stripe_customer=body.stripe_customer,
        current_mrr_usd=mrr,
        plan_name=plan_name,
    )


@router.get("/customers/{project_id}", response_model=list[StripeCustomerMap])
def list_stripe_customers(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    db = get_db()
    result = (
        db.table("stripe_customers")
        .select("*")
        .eq("project_id", project_id)
        .execute()
    )
    return result.data or []


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Stripe webhook receiver — refresh MRR on subscription changes."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig, settings.stripe_webhook_secret
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event["type"] in ("customer.subscription.updated", "customer.subscription.deleted"):
        sub = event["data"]["object"]
        stripe_customer_id = sub["customer"]
        mrr = sub["plan"]["amount"] / 100 if sub.get("plan") else 0
        plan_name = sub["plan"].get("nickname") or sub["plan"].get("product") if sub.get("plan") else None

        db = get_db()
        db.table("stripe_customers").update({
            "current_mrr_usd": mrr,
            "plan_name": plan_name,
        }).eq("stripe_customer", stripe_customer_id).execute()

    return {"received": True}
