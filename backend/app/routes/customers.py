"""Customer economics endpoints."""

from datetime import date, datetime, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user, require_project_access
from app.database import get_db
from app.models.schemas import CustomerRow, CustomerDetail

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]


def _margin_status(margin: Optional[float]) -> str:
    if margin is None:
        return "ok"
    if margin < 0.40:
        return "risk"
    if margin < 0.70:
        return "watch"
    return "ok"


def _compute_margin(mrr: Optional[float], cost: float) -> Optional[float]:
    if mrr is None or mrr == 0:
        return None
    return round((mrr - cost) / mrr, 4)


@router.get("/{project_id}/customers", response_model=list[CustomerRow])
def list_customers(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
):
    db = get_db()

    # Default: last 30 days
    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = to_date - timedelta(days=30)

    # Aggregate from daily_rollups
    result = (
        db.table("daily_rollups")
        .select("customer_id, total_calls, total_cost")
        .eq("project_id", project_id)
        .gte("date", from_date.isoformat())
        .lte("date", to_date.isoformat())
        .execute()
    )
    rows = result.data or []

    # Aggregate per customer
    agg: dict[str, dict] = {}
    for row in rows:
        cid = row["customer_id"]
        if cid not in agg:
            agg[cid] = {"total_cost": 0.0, "call_count": 0}
        agg[cid]["total_cost"] += float(row["total_cost"])
        agg[cid]["call_count"] += int(row["total_calls"])

    # Fetch Stripe customer data
    stripe_result = (
        db.table("stripe_customers")
        .select("customer_id, current_mrr_usd, plan_name")
        .eq("project_id", project_id)
        .execute()
    )
    stripe_map = {
        r["customer_id"]: r for r in (stripe_result.data or [])
    }

    customers = []
    for cid, data in agg.items():
        stripe = stripe_map.get(cid)
        mrr = float(stripe["current_mrr_usd"]) if stripe and stripe.get("current_mrr_usd") else None
        margin = _compute_margin(mrr, data["total_cost"])
        customers.append(CustomerRow(
            customer_id=cid,
            total_cost=round(data["total_cost"], 4),
            call_count=data["call_count"],
            mrr=mrr,
            margin=margin,
            plan=stripe["plan_name"] if stripe else None,
            alert_status=_margin_status(margin),
        ))

    # Sort by cost descending
    customers.sort(key=lambda c: c.total_cost, reverse=True)
    return customers


@router.get("/{project_id}/customers/{customer_id}", response_model=CustomerDetail)
def get_customer(
    project_id: str,
    customer_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
):
    db = get_db()

    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = to_date - timedelta(days=30)

    # Cost by feature for this customer
    feat_result = (
        db.table("daily_rollups")
        .select("feature, total_calls, total_cost")
        .eq("project_id", project_id)
        .eq("customer_id", customer_id)
        .gte("date", from_date.isoformat())
        .lte("date", to_date.isoformat())
        .execute()
    )
    feat_rows = feat_result.data or []

    feat_agg: dict[str, dict] = {}
    total_cost = 0.0
    total_calls = 0
    for row in feat_rows:
        f = row["feature"]
        if f not in feat_agg:
            feat_agg[f] = {"cost": 0.0, "calls": 0}
        feat_agg[f]["cost"] += float(row["total_cost"])
        feat_agg[f]["calls"] += int(row["total_calls"])
        total_cost += float(row["total_cost"])
        total_calls += int(row["total_calls"])

    cost_by_feature = sorted(
        [{"feature": f, "cost": round(v["cost"], 4), "calls": v["calls"]}
         for f, v in feat_agg.items()],
        key=lambda x: x["cost"],
        reverse=True,
    )

    # Daily cost trend
    day_result = (
        db.table("daily_rollups")
        .select("date, total_cost, total_calls")
        .eq("project_id", project_id)
        .eq("customer_id", customer_id)
        .gte("date", from_date.isoformat())
        .lte("date", to_date.isoformat())
        .order("date")
        .execute()
    )
    day_agg: dict[str, dict] = {}
    for row in day_result.data or []:
        d = row["date"]
        if d not in day_agg:
            day_agg[d] = {"cost": 0.0, "calls": 0}
        day_agg[d]["cost"] += float(row["total_cost"])
        day_agg[d]["calls"] += int(row["total_calls"])

    cost_by_day = [
        {"date": d, "cost": round(v["cost"], 4), "calls": v["calls"]}
        for d, v in sorted(day_agg.items())
    ]

    # Recent raw calls
    calls_result = (
        db.table("llm_events")
        .select("model, feature, input_tokens, output_tokens, cost_usd, occurred_at, run_id")
        .eq("project_id", project_id)
        .eq("customer_id", customer_id)
        .gte("occurred_at", from_date.isoformat())
        .lte("occurred_at", to_date.isoformat())
        .order("occurred_at", desc=True)
        .limit(20)
        .execute()
    )
    recent_calls = calls_result.data or []

    # Stripe data
    stripe_result = (
        db.table("stripe_customers")
        .select("current_mrr_usd, plan_name")
        .eq("project_id", project_id)
        .eq("customer_id", customer_id)
        .execute()
    )
    stripe = stripe_result.data[0] if stripe_result.data else None
    mrr = float(stripe["current_mrr_usd"]) if stripe and stripe.get("current_mrr_usd") else None
    margin = _compute_margin(mrr, total_cost)

    return CustomerDetail(
        customer_id=customer_id,
        total_cost=round(total_cost, 4),
        call_count=total_calls,
        mrr=mrr,
        margin=margin,
        plan=stripe["plan_name"] if stripe else None,
        cost_by_feature=cost_by_feature,
        cost_by_day=cost_by_day,
        recent_calls=recent_calls,
    )
