"""Dashboard summary bar + daily trend."""

import calendar
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user, require_project_access
from app.database import get_db
from app.models.schemas import SummaryOut, TrendOut, TrendPoint

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]


@router.get("/{project_id}/summary", response_model=SummaryOut)
def get_summary(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    db = get_db()
    today = date.today()
    month_start = today.replace(day=1)
    last_month_end = month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    # MTD cost per customer (single query covers total + per-customer)
    mtd_detail = (
        db.table("daily_rollups")
        .select("customer_id, total_cost")
        .eq("project_id", project_id)
        .gte("date", month_start.isoformat())
        .lte("date", today.isoformat())
        .execute()
    )
    customer_costs: dict[str, float] = {}
    for row in mtd_detail.data or []:
        cid = row["customer_id"]
        customer_costs[cid] = customer_costs.get(cid, 0) + float(row["total_cost"])
    total_cost_mtd = sum(customer_costs.values())

    # Linear projection to month end
    days_elapsed = (today - month_start).days + 1
    days_in_month = calendar.monthrange(today.year, today.month)[1]
    projected = (total_cost_mtd / days_elapsed * days_in_month) if days_elapsed > 0 else 0

    # Last month cost for comparison
    last_month_result = (
        db.table("daily_rollups")
        .select("total_cost")
        .eq("project_id", project_id)
        .gte("date", last_month_start.isoformat())
        .lte("date", last_month_end.isoformat())
        .execute()
    )
    last_month_cost = sum(float(r["total_cost"]) for r in (last_month_result.data or []))
    pct_change = None
    if last_month_cost > 0:
        pct_change = round((projected - last_month_cost) / last_month_cost * 100, 1)

    # At-risk customers (LLM cost > 60% of MRR this month)
    stripe_result = (
        db.table("stripe_customers")
        .select("customer_id, current_mrr_usd")
        .eq("project_id", project_id)
        .execute()
    )
    stripe_map = {r["customer_id"]: r for r in (stripe_result.data or [])}

    at_risk = 0
    for cid, cost in customer_costs.items():
        stripe = stripe_map.get(cid)
        if stripe and stripe.get("current_mrr_usd"):
            mrr = float(stripe["current_mrr_usd"])
            if mrr > 0 and cost / mrr > 0.60:
                at_risk += 1

    # Top feature this month
    feat_detail = (
        db.table("daily_rollups")
        .select("feature, total_cost")
        .eq("project_id", project_id)
        .gte("date", month_start.isoformat())
        .lte("date", today.isoformat())
        .execute()
    )
    feat_costs: dict[str, float] = {}
    for row in feat_detail.data or []:
        f = row["feature"]
        feat_costs[f] = feat_costs.get(f, 0) + float(row["total_cost"])
    top_feature = max(feat_costs, key=feat_costs.get) if feat_costs else None

    return SummaryOut(
        total_cost_mtd=round(total_cost_mtd, 2),
        projected_month_end=round(projected, 2),
        pct_change_vs_last_month=pct_change,
        customers_at_risk=at_risk,
        top_cost_driver_feature=top_feature,
        total_customers=len(customer_costs),
    )


@router.get("/{project_id}/trend", response_model=TrendOut)
def get_trend(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
    days: int = Query(default=30, ge=1, le=365),
):
    """Daily total cost/calls series (zero-filled) for the trend chart."""
    db = get_db()
    today = date.today()
    from_date = today - timedelta(days=days - 1)

    result = (
        db.table("daily_rollups")
        .select("date, total_cost, total_calls")
        .eq("project_id", project_id)
        .gte("date", from_date.isoformat())
        .lte("date", today.isoformat())
        .execute()
    )

    by_day: dict[str, dict] = {}
    for row in result.data or []:
        d = row["date"]
        agg = by_day.setdefault(d, {"cost": 0.0, "calls": 0})
        agg["cost"] += float(row["total_cost"])
        agg["calls"] += int(row["total_calls"])

    points = []
    cursor = from_date
    while cursor <= today:
        key = cursor.isoformat()
        agg = by_day.get(key, {"cost": 0.0, "calls": 0})
        points.append(TrendPoint(date=cursor, cost=round(agg["cost"], 4), calls=agg["calls"]))
        cursor += timedelta(days=1)

    return TrendOut(
        points=points,
        total_cost=round(sum(p.cost for p in points), 4),
        total_calls=sum(p.calls for p in points),
    )
