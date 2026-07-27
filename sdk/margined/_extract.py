"""
Usage extraction from provider response objects.

Handles Anthropic Messages, OpenAI Chat Completions / Responses, and any
object exposing a compatible `.usage`. Cache tokens are split out so cost
reflects provider cache discounts:

  Anthropic usage:  input_tokens (uncached), output_tokens,
                    cache_read_input_tokens, cache_creation_input_tokens
  OpenAI usage:     prompt_tokens (INCLUDES cached), completion_tokens,
                    prompt_tokens_details.cached_tokens
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Optional

from ._pricing import compute_cost, detect_provider


def _get(obj: Any, name: str) -> int:
    value = getattr(obj, name, None)
    if value is None and isinstance(obj, dict):
        value = obj.get(name)
    try:
        return int(value) if value is not None else 0
    except (TypeError, ValueError):
        return 0


def extract_usage(response: Any) -> Optional[dict[str, int]]:
    """Return normalized token counts from a provider response, or None."""
    usage = getattr(response, "usage", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage")
    if usage is None:
        return None
    return usage_from_obj(usage)


def usage_from_obj(usage: Any) -> dict[str, int]:
    # Anthropic-style
    input_tokens = _get(usage, "input_tokens")
    output_tokens = _get(usage, "output_tokens")
    cache_read = _get(usage, "cache_read_input_tokens")
    cache_write = _get(usage, "cache_creation_input_tokens")

    if input_tokens == 0 and output_tokens == 0:
        # OpenAI-style
        prompt = _get(usage, "prompt_tokens")
        completion = _get(usage, "completion_tokens")
        details = getattr(usage, "prompt_tokens_details", None)
        if details is None and isinstance(usage, dict):
            details = usage.get("prompt_tokens_details")
        cached = _get(details, "cached_tokens") if details is not None else 0
        input_tokens = max(prompt - cached, 0)  # uncached portion
        output_tokens = completion
        cache_read = cached
        cache_write = 0

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read,
        "cache_write_tokens": cache_write,
    }


def build_event(
    response: Any,
    user_id: str,
    feature: str,
    run_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    model: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Build an ingest event from a provider response. None if no usage found."""
    usage = extract_usage(response)
    if usage is None:
        return None
    resolved_model = model or getattr(response, "model", None) or "unknown"
    return build_event_from_usage(usage, resolved_model, user_id, feature, run_id, metadata)


def build_event_from_usage(
    usage: dict[str, int],
    model: str,
    user_id: str,
    feature: str,
    run_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    cost = compute_cost(
        model,
        usage["input_tokens"],
        usage["output_tokens"],
        usage["cache_read_tokens"],
        usage["cache_write_tokens"],
    )
    return {
        # Idempotency key: the ingest API dedupes on (project, event_id), so a
        # retried flush can never double-count cost.
        "event_id": str(uuid.uuid4()),
        "customer_id": str(user_id),
        "feature": str(feature),
        "run_id": run_id,
        "model": model,
        "provider": detect_provider(model),
        "input_tokens": usage["input_tokens"],
        "output_tokens": usage["output_tokens"],
        "cache_read_tokens": usage["cache_read_tokens"],
        "cache_write_tokens": usage["cache_write_tokens"],
        "cost_usd": cost,
        "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "metadata": metadata or {},
    }
