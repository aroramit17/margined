"""Alert configuration and delivery."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user, require_project_access
from app.database import get_db
from app.models.schemas import AlertConfigCreate, AlertConfigOut

router = APIRouter()

User = Annotated[dict, Depends(get_current_user)]


@router.get("/{project_id}/alerts", response_model=list[AlertConfigOut])
def list_alerts(
    project_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    db = get_db()
    result = (
        db.table("alert_configs")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/{project_id}/alerts", response_model=AlertConfigOut, status_code=201)
def create_alert(
    project_id: str,
    body: AlertConfigCreate,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    if body.alert_type not in ("margin_threshold", "feature_spend", "bill_forecast"):
        raise HTTPException(status_code=400, detail="Invalid alert_type")
    if body.channel not in ("email", "slack"):
        raise HTTPException(status_code=400, detail="Invalid channel")

    db = get_db()
    result = (
        db.table("alert_configs")
        .insert({
            "project_id": project_id,
            "alert_type": body.alert_type,
            "threshold": body.threshold,
            "channel": body.channel,
            "destination": body.destination,
        })
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create alert")
    return result.data[0]


@router.patch("/{project_id}/alerts/{alert_id}", response_model=AlertConfigOut)
def update_alert(
    project_id: str,
    alert_id: str,
    body: dict,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    db = get_db()
    allowed_fields = {"threshold", "channel", "destination", "enabled"}
    update = {k: v for k, v in body.items() if k in allowed_fields}
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    result = (
        db.table("alert_configs")
        .update(update)
        .eq("id", alert_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return result.data[0]


@router.delete("/{project_id}/alerts/{alert_id}", status_code=204)
def delete_alert(
    project_id: str,
    alert_id: str,
    user: User,
    project: Annotated[dict, Depends(require_project_access)],
):
    db = get_db()
    db.table("alert_configs").delete().eq("id", alert_id).eq("project_id", project_id).execute()
