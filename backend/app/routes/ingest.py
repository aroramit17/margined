"""Bounded, server-priced ingestion; acknowledge only committed usage.

SDKs isolate telemetry failures from provider calls and retry transient errors.
Deduplication, current-key validation and account limits live in PostgreSQL.
"""

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from app import pricing
from app.database import get_db
from app.models.schemas import LLMEventIn

router = APIRouter()
MAX_EVENTS_PER_BATCH = 100
MAX_BODY_BYTES = 1_000_000


def _store_batch(api_key: str, rows: list[dict]) -> dict:
    return get_db().rpc("ingest_event_batch", {
        "p_api_key": api_key, "p_events": rows,
    }).execute().data


@router.post("", status_code=202)
@router.post("/", status_code=202)
async def ingest_events(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not (api_key := auth[7:].strip()) or len(api_key) > 256:
        raise HTTPException(401, "A valid project API key is required")
    body_bytes = bytearray()
    async for chunk in request.stream():
        if len(body_bytes) + len(chunk) > MAX_BODY_BYTES:
            raise HTTPException(413, "Batch body exceeds 1 MB")
        body_bytes.extend(chunk)
    try:
        body = json.loads(body_bytes)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(400, "Invalid JSON") from None
    if not isinstance(body, dict):
        raise HTTPException(422, "Expected an event or an events array")
    events_raw = body.get("events", [body] if "customer_id" in body else None)
    if not isinstance(events_raw, list) or not 1 <= len(events_raw) <= MAX_EVENTS_PER_BATCH:
        raise HTTPException(422, "A batch requires 1-100 events")
    rows = []
    now = datetime.now(timezone.utc)
    for index, raw in enumerate(events_raw):
        try:
            event = LLMEventIn.model_validate(raw)
        except ValidationError:
            # Never echo payloads, which may contain private customer metadata.
            raise HTTPException(422, {"event_index": index, "error": "Invalid event fields"}) from None
        if event.occurred_at.tzinfo is None or not (
            now - timedelta(days=100) <= event.occurred_at <= now + timedelta(minutes=5)
        ):
            raise HTTPException(422, {"event_index": index, "error": "Timestamp outside the supported window"})
        cost = pricing.compute_cost(event.model, event.input_tokens, event.output_tokens,
                                    event.cache_read_tokens, event.cache_write_tokens)
        if cost is None:
            raise HTTPException(422, {"event_index": index, "error": "Model has no server price"})
        row = event.model_dump(mode="json")
        row["cost_usd"] = f"{cost:.10f}"
        rows.append(row)
    try:
        result = await run_in_threadpool(_store_batch, api_key, rows)
        if not isinstance(result, dict) or result.get("status") not in {
            "ok", "invalid_key", "rate_limited", "quota_exceeded"
        }:
            raise ValueError("Unexpected ingestion result")
    except Exception:
        raise HTTPException(503, "Usage storage unavailable; retry this batch",
                            headers={"Retry-After": "5"}) from None
    if result["status"] == "invalid_key":
        raise HTTPException(401, "Invalid project API key")
    if result["status"] in {"rate_limited", "quota_exceeded"}:
        return JSONResponse(result, status_code=429,
                            headers={"Retry-After": str(result["retry_after"])})
    return result
