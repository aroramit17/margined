"""
Pricing calculator — derives break-even and recommended prices
from actual usage data.
"""

import statistics
from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user, require_project_access
from app.database import get_db
from app.models.schemas import PricingCalculatorOut, TierAnalysis

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]

SAFETY_MULTIPLE = 3.0   # recommended_price = break_even * SAFETY_MULTIPLE


def _recommended_price(break_even: float, target_margin: float) -> float:
    """Price required to achieve target_margin: price = break_even / (1 - margin)."""
    if target_margin >= 1.0:
        target_margin = 0.99
    return break_even / (1 - target_margin)


def _margin_at_cogs(price: Optional[float], cogs: float) -> float:
    if not price or price == 0:
        return 0.0
    return round((price - cogs) / price, 4)


@router.get("/{project_id}/pricing-calculator", response_model=PricingCalculatorOut)
def pricing_calculator(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
    target_margin: float = Query(default=0.70, ge=0, le=0.99),
):
    db = get_db()
    today = date.today()
    from_date = today - timedelta(days=30)

    # Get all customer-level costs + Stripe plan
    rollup = (
        db.table("daily_rollups")
        .select("customer_id, total_cost, total_calls")
        .eq("project_id", project_id)
        .gte("date", from_date.isoformat())
        .lte("date", today.isoformat())
        .execute()
    )
    rows = rollup.data or []

    cust_agg: dict[str, dict] = {}
    for row in rows:
        cid = row["customer_id"]
        if cid not in cust_agg:
            cust_agg[cid] = {"cost": 0.0, "calls": 0}
        cust_agg[cid]["cost"] += float(row["total_cost"])
        cust_agg[cid]["calls"] += int(row["total_calls"])

    # Stripe data
    stripe_result = (
        db.table("stripe_customers")
        .select("customer_id, current_mrr_usd, plan_name")
        .eq("project_id", project_id)
        .execute()
    )
    stripe_map = {r["customer_id"]: r for r in (stripe_result.data or [])}

    # Group customers by plan tier
    tiers: dict[str, list[dict]] = {}
    for cid, data in cust_agg.items():
        stripe = stripe_map.get(cid)
        plan = stripe["plan_name"] if stripe and stripe.get("plan_name") else "Unknown"
        mrr = float(stripe["current_mrr_usd"]) if stripe and stripe.get("current_mrr_usd") else None
        if plan not in tiers:
            tiers[plan] = []
        tiers[plan].append({
            "cost": data["cost"],
            "calls": data["calls"],
            "mrr": mrr,
        })

    # If no tiers, create a synthetic "All" tier
    if not tiers and cust_agg:
        all_customers = [{"cost": v["cost"], "calls": v["calls"], "mrr": None}
                        for v in cust_agg.values()]
        tiers = {"All Customers": all_customers}

    analyses = []
    for tier_name, customers in tiers.items():
        if not customers:
            continue

        costs = [c["cost"] for c in customers]
        calls = [c["calls"] for c in customers]
        mrrs = [c["mrr"] for c in customers if c["mrr"] is not None]

        # Percentiles
        sorted_costs = sorted(costs)
        n = len(sorted_costs)

        def percentile(data: list, p: float) -> float:
            if not data:
                return 0.0
            idx = int(p / 100 * (len(data) - 1))
            return data[idx]

        median_cogs = statistics.median(sorted_costs) if costs else 0.0
        p90_cogs = percentile(sorted_costs, 90)
        p99_cogs = percentile(sorted_costs, 99)

        sorted_calls = sorted(calls)
        median_calls = statistics.median(sorted_calls) if calls else 0.0
        p90_calls = percentile(sorted_calls, 90)

        break_even = median_cogs / (1 - target_margin) if median_cogs > 0 else 0
        recommended = _recommended_price(median_cogs, target_margin)

        current_price = statistics.median(mrrs) if mrrs else None

        margin_at_median = _margin_at_cogs(current_price, median_cogs)
        margin_at_p90 = _margin_at_cogs(current_price, p90_cogs)
        margin_at_p99 = _margin_at_cogs(current_price, p99_cogs)

        # Suggest usage cap if P99 margin is dangerously low
        cap_recommendation = None
        if margin_at_p99 < 0.40 and p90_calls > 0:
            # Cap at p90 calls to eliminate P99 bleed
            cap_recommendation = int(p90_calls * 1.2)

        analyses.append(TierAnalysis(
            tier_name=tier_name,
            customer_count=len(customers),
            median_calls=round(median_calls, 0),
            median_cogs=round(median_cogs, 4),
            p90_calls=round(p90_calls, 0),
            p90_cogs=round(p90_cogs, 4),
            p99_cogs=round(p99_cogs, 4),
            break_even_price=round(break_even, 2),
            recommended_price=round(recommended, 2),
            current_price=round(current_price, 2) if current_price else None,
            margin_at_median=margin_at_median,
            margin_at_p90=margin_at_p90,
            margin_at_p99=margin_at_p99,
            usage_cap_recommendation=cap_recommendation,
        ))

    return PricingCalculatorOut(target_margin=target_margin, tiers=analyses)
