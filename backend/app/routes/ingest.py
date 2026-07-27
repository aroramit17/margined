"""
POST /ingest — SDK-facing event ingestion endpoint.

Auth: Bearer {project_api_key} (not a user JWT — this is the SDK API key).
Contract with the SDK: always return 202 so tracking can never break the
caller's app; invalid events are dropped, not errored.

Hardening:
  - per-key sliding-window rate limit
  - API-key -> project lookup cache (avoids a DB roundtrip per batch)
  - server-side cost recompute from raw token counts (client cost is a
    hint, not a trusted value)
  - idempotent inserts on (project_id, event_id)
"""

import threading
import time

from fastapi import APIRouter, Request, Response, status
from pydantic import ValidationError

from app import pricing
from app.auth import get_project_by_api_key
from app.database import get_db
from app.models.schemas import LLMEventIn

router = APIRouter()

MAX_EVENTS_PER_BATCH = 100
MAX_BODY_BYTES = 1_000_000  # 1 MB

# ── Per-key rate limit (in-memory; move to Redis for multi-instance) ──
_RATE_LIMIT = 120  # batches per minute per key
_rate_lock = threading.Lock()
_rate_windows: dict[str, list[float]] = {}


def _rate_limited(api_key: str) -> bool:
    now = time.monotonic()
    with _rate_lock:
        window = _rate_windows.setdefault(api_key, [])
        cutoff = now - 60.0
        while window and window[0] < cutoff:
            window.pop(0)
        if len(window) >= _RATE_LIMIT:
            return True
        window.append(now)
        return False


# ── API-key lookup cache (60s TTL) ────────────────────────────────────
_key_lock = threading.Lock()
_key_cache: dict[str, tuple[float, dict | None]] = {}
_KEY_TTL = 60.0


def _project_for_key(api_key: str) -> dict | None:
    now = time.monotonic()
    with _key_lock:
        hit = _key_cache.get(api_key)
        if hit and now - hit[0] < _KEY_TTL:
            return hit[1]
    project = get_project_by_api_key(api_key)
    with _key_lock:
        _key_cache[api_key] = (now, project)
        if len(_key_cache) > 10_000:
            _key_cache.clear()
    return project


@router.post("", status_code=status.HTTP_202_ACCEPTED)
@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def ingest_events(request: Request):
    """Accept LLM event batches from the SDK. Returns 202 always."""
    accepted = Response(status_code=status.HTTP_202_ACCEPTED)

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return accepted
    api_key = auth.removeprefix("Bearer ").strip()
    if not api_key or _rate_limited(api_key):
        return accepted

    project = _project_for_key(api_key)
    if not project:
        return accepted
    project_id = project["id"]

    body_bytes = await request.body()
    if len(body_bytes) > MAX_BODY_BYTES:
        return accepted
    try:
        import json

        body = json.loads(body_bytes)
    except Exception:
        return accepted

    if not isinstance(body, dict):
        return accepted
    events_raw = body.get("events")
    if events_raw is None and "customer_id" in body:
        events_raw = [body]
    if not isinstance(events_raw, list) or not events_raw:
        return accepted

    rows = []
    for raw in events_raw[:MAX_EVENTS_PER_BATCH]:
        try:
            event = LLMEventIn(**raw)
        except (ValidationError, TypeError):
            continue
        # Server-side recompute from raw token counts. Falls back to the
        # SDK-computed cost only for models the server doesn't know.
        cost = pricing.compute_cost(
            event.model,
            event.input_tokens,
            event.output_tokens,
            event.cache_read_tokens,
            event.cache_write_tokens,
        )
        if cost is None:
            cost = event.cost_usd
        rows.append({
            "project_id": project_id,
            "event_id": event.event_id,
            "customer_id": event.customer_id[:256],
            "feature": event.feature[:256],
            "run_id": event.run_id,
            "model": event.model[:256],
            "provider": event.provider[:64],
            "input_tokens": event.input_tokens,
            "output_tokens": event.output_tokens,
            "cache_read_tokens": event.cache_read_tokens,
            "cache_write_tokens": event.cache_write_tokens,
            "cost_usd": f"{cost:.10f}",
            "metadata": event.metadata,
            "occurred_at": event.occurred_at.isoformat(),
        })

    if rows:
        try:
            db = get_db()
            # ignore_duplicates: a retried SDK flush re-sends the same
            # event_ids; the unique index makes the insert idempotent.
            db.table("llm_events").upsert(
                rows, on_conflict="project_id,event_id", ignore_duplicates=True
            ).execute()
        except Exception:
            try:
                # Fallback for rows without event_id (older SDKs)
                get_db().table("llm_events").insert(rows).execute()
            except Exception:
                pass  # swallow — SDK must never break

    return accepted
