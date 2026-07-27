"""Stripe integration — OAuth connect, MRR sync, customer mapping."""

from typing import Annotated, Optional

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth import get_current_user, require_project_access
from app.config import settings
from app.database import get_db
from app.models.schemas import StripeCustomerMap

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]

_INTERVAL_TO_MONTHLY = {"day": 30.0, "week": 4.33, "month": 1.0, "year": 1 / 12}


def _get_stripe():
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    stripe.api_key = settings.stripe_secret_key
    return stripe


def _mrr_from_subscription(sub) -> tuple[float, Optional[str]]:
    """Normalize a subscription's items to monthly recurring revenue in USD."""
    mrr = 0.0
    plan_name = None
    items = sub.get("items", {}).get("data", []) if isinstance(sub, dict) else sub.items.data
    for item in items:
        price = item.get("price") if isinstance(item, dict) else item.price
        if not price:
            continue
        recurring = price.get("recurring") if isinstance(price, dict) else price.recurring
        unit_amount = price.get("unit_amount") if isinstance(price, dict) else price.unit_amount
        quantity = item.get("quantity", 1) if isinstance(item, dict) else (item.quantity or 1)
        if not recurring or unit_amount is None:
            continue
        interval = recurring.get("interval") if isinstance(recurring, dict) else recurring.interval
        interval_count = (
            recurring.get("interval_count", 1)
            if isinstance(recurring, dict)
            else (recurring.interval_count or 1)
        )
        factor = _INTERVAL_TO_MONTHLY.get(interval, 1.0) / max(interval_count, 1)
        mrr += (unit_amount / 100.0) * quantity * factor
        if plan_name is None:
            nickname = price.get("nickname") if isinstance(price, dict) else price.nickname
            product = price.get("product") if isinstance(price, dict) else price.product
            plan_name = nickname or (product if isinstance(product, str) else None)
    return round(mrr, 2), plan_name


def _fetch_customer_mrr(stripe_customer_id: str) -> tuple[Optional[float], Optional[str]]:
    """Sum MRR across a customer's active subscriptions."""
    try:
        subscriptions = stripe.Subscription.list(
            customer=stripe_customer_id, status="active", limit=10
        )
    except Exception:
        return None, None
    total = 0.0
    plan_name = None
    for sub in subscriptions.auto_paging_iter() if hasattr(subscriptions, "auto_paging_iter") else subscriptions.data:
        mrr, name = _mrr_from_subscription(sub)
        total += mrr
        plan_name = plan_name or name
    if total == 0.0 and not subscriptions.data:
        return None, None
    return round(total, 2), plan_name


@router.get("/connect/{project_id}")
def get_connect_url(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    """Return a Stripe OAuth Connect URL for the project."""
    _get_stripe()
    if not settings.stripe_client_id:
        raise HTTPException(status_code=503, detail="Stripe Connect not configured")
    url = (
        "https://connect.stripe.com/oauth/authorize"
        "?response_type=code"
        f"&client_id={settings.stripe_client_id}"
        "&scope=read_only"
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
    mrr, plan_name = _fetch_customer_mrr(body.stripe_customer)

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


@router.post("/customers/{project_id}/refresh")
def refresh_mrr(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    """Re-pull MRR from Stripe for every mapped customer in the project."""
    _get_stripe()
    db = get_db()
    result = (
        db.table("stripe_customers")
        .select("customer_id, stripe_customer")
        .eq("project_id", project_id)
        .execute()
    )
    refreshed = 0
    for row in result.data or []:
        mrr, plan_name = _fetch_customer_mrr(row["stripe_customer"])
        db.table("stripe_customers").update({
            "current_mrr_usd": mrr,
            "plan_name": plan_name,
        }).eq("project_id", project_id).eq("customer_id", row["customer_id"]).execute()
        refreshed += 1
    return {"refreshed": refreshed}


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

    if event["type"] in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        sub = event["data"]["object"]
        stripe_customer_id = sub["customer"]
        if event["type"] == "customer.subscription.deleted":
            mrr, plan_name = 0.0, None
        else:
            mrr, plan_name = _mrr_from_subscription(sub)

        db = get_db()
        db.table("stripe_customers").update({
            "current_mrr_usd": mrr,
            "plan_name": plan_name,
        }).eq("stripe_customer", stripe_customer_id).execute()

    return {"received": True}
