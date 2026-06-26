"""
POST /ingest — SDK-facing event ingestion endpoint.
Auth: Bearer {project_api_key} (not a user JWT — this is the SDK API key).
Always returns 202 Accepted to avoid breaking SDK callers.
"""

from fastapi import APIRouter, Request, Response, status
from pydantic import ValidationError

from app.database import get_db
from app.auth import get_project_by_api_key
from app.models.schemas import LLMEventIn, BatchIngestRequest

router = APIRouter()


@router.post("", status_code=status.HTTP_202_ACCEPTED)
@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def ingest_events(request: Request):
    """
    Accept LLM event batches from the SDK.
    Returns 202 always — no validation errors exposed to SDK callers.
    """
    # Extract API key
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return Response(status_code=status.HTTP_202_ACCEPTED)

    api_key = auth.removeprefix("Bearer ").strip()
    project = get_project_by_api_key(api_key)
    if not project:
        return Response(status_code=status.HTTP_202_ACCEPTED)

    project_id = project["id"]

    # Parse body — accept both single event and batch
    try:
        body = await request.json()
    except Exception:
        return Response(status_code=status.HTTP_202_ACCEPTED)

    events_raw: list[dict] = []
    if "events" in body:
        events_raw = body["events"]
    elif "customer_id" in body:
        events_raw = [body]

    if not events_raw:
        return Response(status_code=status.HTTP_202_ACCEPTED)

    # Validate and build insert rows
    rows = []
    for raw in events_raw[:100]:  # hard cap at 100 per batch
        try:
            event = LLMEventIn(**raw)
            rows.append({
                "project_id": project_id,
                "customer_id": event.customer_id,
                "feature": event.feature,
                "run_id": event.run_id,
                "model": event.model,
                "provider": event.provider,
                "input_tokens": event.input_tokens,
                "output_tokens": event.output_tokens,
                "cost_usd": str(event.cost_usd),
                "metadata": event.metadata,
                "occurred_at": event.occurred_at.isoformat(),
            })
        except (ValidationError, Exception):
            continue  # skip invalid events silently

    if rows:
        try:
            db = get_db()
            db.table("llm_events").insert(rows).execute()
        except Exception:
            pass  # swallow DB errors — SDK must never break

    return Response(status_code=status.HTTP_202_ACCEPTED)
