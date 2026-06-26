"""Dashboard summary bar — MTD cost, projection, at-risk customers."""

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import get_current_user, require_project_access
from app.database import get_db
from app.models.schemas import SummaryOut

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
    last_month_start = (month_start - timedelta(days=1)).replace(day=1)
    last_month_end = month_start - timedelta(days=1)

    # MTD cost
    mtd_result = (
        db.table("daily_rollups")
        .select("total_cost")
        .eq("project_id", project_id)
        .gte("date", month_start.isoformat())
        .lte("date", today.isoformat())
        .execute()
    )
    total_cost_mtd = sum(float(r["total_cost"]) for r in (mtd_result.data or []))

    # Linear projection to month end
    days_elapsed = (today - month_start).days + 1
    days_in_month = (today.replace(month=today.month % 12 + 1, day=1) - timedelta(days=1)).day if today.month < 12 else 31
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
    customer_costs: dict[str, float] = {}
    for row in (mtd_result.data or []):
        cid = row.get("customer_id", "")
        if cid:
            customer_costs[cid] = customer_costs.get(cid, 0) + float(row["total_cost"])

    # Re-query with customer_id for MTD aggregation
    mtd_detail = (
        db.table("daily_rollups")
        .select("customer_id, total_cost")
        .eq("project_id", project_id)
        .gte("date", month_start.isoformat())
        .lte("date", today.isoformat())
        .execute()
    )
    customer_costs = {}
    for row in (mtd_detail.data or []):
        cid = row["customer_id"]
        customer_costs[cid] = customer_costs.get(cid, 0) + float(row["total_cost"])

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
    feat_costs: dict[str, float] = {}
    feat_detail = (
        db.table("daily_rollups")
        .select("feature, total_cost")
        .eq("project_id", project_id)
        .gte("date", month_start.isoformat())
        .lte("date", today.isoformat())
        .execute()
    )
    for row in (feat_detail.data or []):
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
