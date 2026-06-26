"""Feature profitability ranking endpoint."""

from datetime import date, timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user, require_project_access
from app.database import get_db
from app.models.schemas import FeatureRow

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]


@router.get("/{project_id}/features", response_model=list[FeatureRow])
def list_features(
    project_id: str,
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

    result = (
        db.table("daily_rollups")
        .select("feature, total_calls, total_cost")
        .eq("project_id", project_id)
        .gte("date", from_date.isoformat())
        .lte("date", to_date.isoformat())
        .execute()
    )
    rows = result.data or []

    # Aggregate per feature
    agg: dict[str, dict] = {}
    for row in rows:
        f = row["feature"]
        if f not in agg:
            agg[f] = {"cost": 0.0, "calls": 0}
        agg[f]["cost"] += float(row["total_cost"])
        agg[f]["calls"] += int(row["total_calls"])

    total_cost = sum(v["cost"] for v in agg.values())

    features = []
    for feat, data in agg.items():
        avg = data["cost"] / data["calls"] if data["calls"] > 0 else 0
        pct = (data["cost"] / total_cost * 100) if total_cost > 0 else 0
        features.append(FeatureRow(
            feature=feat,
            total_cost=round(data["cost"], 4),
            call_count=data["calls"],
            avg_cost_per_call=round(avg, 6),
            pct_of_bill=round(pct, 1),
        ))

    features.sort(key=lambda f: f.total_cost, reverse=True)
    return features
