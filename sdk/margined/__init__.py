"""
Margined SDK — LLM unit economics tracking.

Two integration modes:

  # Mode 1: Auto-patch (recommended, zero call-site changes)
  import margined
  margined.patch_anthropic()
  margined.patch_openai()
  margined.set_context(user_id=lambda: current_user.id, feature=lambda: request.path)

  # Mode 2: Explicit wrapper (per-call control)
  response = margined.track(client.messages.create(...), user_id=..., feature=...)
"""

import os
import time
import threading
import contextvars
from typing import Any, Callable, Optional

import httpx

_api_key: Optional[str] = None
_endpoint = "https://api.trymargined.com/ingest"
_queue: list = []
_lock = threading.Lock()
_flush_thread: Optional[threading.Thread] = None

# Context vars for auto-patch mode — safe across async/threading
_ctx_user_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "margined_user_id", default=None
)
_ctx_feature: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "margined_feature", default=None
)

# Callables for dynamic context (e.g. Flask g.user.id, FastAPI request state)
_user_id_fn: Optional[Callable[[], Optional[str]]] = None
_feature_fn: Optional[Callable[[], Optional[str]]] = None

# Track which clients have been patched to avoid double-patching
_patched: set[str] = set()

PRICES = {
    # Anthropic
    "claude-opus-4-8":           {"in": 0.000015,   "out": 0.000075},
    "claude-sonnet-4-6":         {"in": 0.000003,   "out": 0.000015},
    "claude-haiku-4-5-20251001": {"in": 0.0000008,  "out": 0.000004},
    "claude-haiku-4-5":          {"in": 0.0000008,  "out": 0.000004},
    "claude-3-5-sonnet-20241022":{"in": 0.000003,   "out": 0.000015},
    "claude-3-5-haiku-20241022": {"in": 0.0000008,  "out": 0.000004},
    # OpenAI
    "gpt-4o":                    {"in": 0.0000025,  "out": 0.000010},
    "gpt-4o-mini":               {"in": 0.00000015, "out": 0.0000006},
    "gpt-4-turbo":               {"in": 0.000010,   "out": 0.000030},
    "gpt-3.5-turbo":             {"in": 0.0000005,  "out": 0.0000015},
    "o1":                        {"in": 0.000015,   "out": 0.000060},
    "o3-mini":                   {"in": 0.0000011,  "out": 0.0000044},
    # Groq
    "llama-3.1-70b-versatile":   {"in": 0.00000059, "out": 0.00000079},
    "llama-3.1-8b-instant":      {"in": 0.00000005, "out": 0.00000008},
    "mixtral-8x7b-32768":        {"in": 0.00000024, "out": 0.00000024},
    # Together AI
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo": {"in": 0.00000088, "out": 0.00000088},
    "mistralai/Mixtral-8x7B-Instruct-v0.1":          {"in": 0.00000060, "out": 0.00000060},
}

_DEFAULT_PRICE = {"in": 0.000003, "out": 0.000015}


# ──────────────────────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────────────────────

def init(api_key: str = None, endpoint: str = None):
    """Initialize the SDK. Call once at app startup."""
    global _api_key, _endpoint, _flush_thread
    _api_key = api_key or os.environ.get("MARGINED_API_KEY")
    if endpoint:
        _endpoint = endpoint
    if _flush_thread is None or not _flush_thread.is_alive():
        _flush_thread = threading.Thread(target=_flush_loop, daemon=True)
        _flush_thread.start()


def set_context(
    user_id: "str | Callable[[], str | None] | None" = None,
    feature: "str | Callable[[], str | None] | None" = None,
):
    """
    Set user/feature context for auto-patch mode.

    Pass a string for static context, or a callable for dynamic context
    (e.g. reading from Flask g or FastAPI request state):

        margined.set_context(
            user_id=lambda: g.current_user.id,
            feature=lambda: request.endpoint,
        )
    """
    global _user_id_fn, _feature_fn
    if callable(user_id):
        _user_id_fn = user_id
    elif user_id is not None:
        _user_id_fn = lambda: user_id  # noqa: E731
    if callable(feature):
        _feature_fn = feature
    elif feature is not None:
        _feature_fn = lambda: feature  # noqa: E731


def patch_anthropic():
    """
    Auto-patch the Anthropic client to track all calls automatically.
    Call once at app startup. No per-call changes needed.

        import margined
        margined.patch_anthropic()
        margined.set_context(user_id=lambda: g.user.id, feature=lambda: request.endpoint)
    """
    if "anthropic" in _patched:
        return
    try:
        import anthropic

        original_create = anthropic.resources.messages.Messages.create

        def _tracked_create(self_client, *args, **kwargs):
            response = original_create(self_client, *args, **kwargs)
            _record_from_context(response)
            return response

        anthropic.resources.messages.Messages.create = _tracked_create
        _patched.add("anthropic")
    except ImportError:
        pass  # anthropic not installed, silently skip
    except Exception:
        pass


def patch_openai():
    """
    Auto-patch the OpenAI client to track all calls automatically.
    Call once at app startup. No per-call changes needed.
    """
    if "openai" in _patched:
        return
    try:
        import openai

        original_create = openai.resources.chat.completions.Completions.create

        def _tracked_create(self_client, *args, **kwargs):
            response = original_create(self_client, *args, **kwargs)
            _record_from_context(response)
            return response

        openai.resources.chat.completions.Completions.create = _tracked_create
        _patched.add("openai")
    except ImportError:
        pass
    except Exception:
        pass


def track(response: Any, *, user_id: str, feature: str,
          run_id: str = None, metadata: dict = None) -> Any:
    """
    Transparent pass-through wrapper. Returns response unchanged.
    Use when you want explicit per-call control instead of auto-patching.
    """
    if _api_key is None:
        return response
    try:
        event = _extract_event(response, user_id, feature, run_id, metadata)
        if event is not None:
            with _lock:
                _queue.append(event)
    except Exception:
        pass
    return response


def flush():
    """Manually flush the event queue. Use in serverless environments before function exits."""
    _flush()


class run:
    """
    Context manager for multi-step agent runs.
    All LLM calls within the block are grouped under one run_id.

        with margined.run(user_id=user.id, feature="research_agent") as r:
            step1 = client.messages.create(...)
            step2 = client.messages.create(...)
            r.tag({"steps": 2})
    """

    def __init__(self, user_id: str, feature: str, metadata: dict = None):
        self.user_id = user_id
        self.feature = feature
        self.run_id = f"run_{int(time.time() * 1000)}"
        self.metadata = metadata or {}
        self._token_user: Optional[contextvars.Token] = None
        self._token_feat: Optional[contextvars.Token] = None

    def __enter__(self):
        self._token_user = _ctx_user_id.set(self.user_id)
        self._token_feat = _ctx_feature.set(self.feature)
        return self

    def __exit__(self, *args):
        if self._token_user is not None:
            _ctx_user_id.reset(self._token_user)
        if self._token_feat is not None:
            _ctx_feature.reset(self._token_feat)

    def tag(self, extra: dict):
        self.metadata.update(extra)


# Attach run to track so `margined.track.run(...)` still works
track.run = run  # type: ignore[attr-defined]


# ──────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────

def _resolve_context() -> tuple[Optional[str], Optional[str]]:
    """Resolve user_id and feature from context vars or callables."""
    user_id = _ctx_user_id.get()
    feature = _ctx_feature.get()

    if user_id is None and _user_id_fn is not None:
        try:
            user_id = _user_id_fn()
        except Exception:
            user_id = None

    if feature is None and _feature_fn is not None:
        try:
            feature = _feature_fn()
        except Exception:
            feature = None

    return user_id, feature


def _record_from_context(response: Any):
    """Record a response using the ambient context (auto-patch mode)."""
    if _api_key is None:
        return
    try:
        user_id, feature = _resolve_context()
        if user_id is None:
            return  # no context set — skip silently
        event = _extract_event(response, user_id, feature or "unknown", None, None)
        if event is not None:
            with _lock:
                _queue.append(event)
    except Exception:
        pass


def _extract_event(response, user_id, feature, run_id, metadata):
    usage = getattr(response, "usage", None)
    if usage is None:
        return None
    model = getattr(response, "model", "unknown")
    input_tokens = (
        getattr(usage, "input_tokens", None)
        or getattr(usage, "prompt_tokens", 0)
        or 0
    )
    output_tokens = (
        getattr(usage, "output_tokens", None)
        or getattr(usage, "completion_tokens", 0)
        or 0
    )
    cost = _compute_cost(model, input_tokens, output_tokens)
    return {
        "customer_id": str(user_id),
        "feature": str(feature),
        "run_id": run_id,
        "model": model,
        "provider": _detect_provider(model),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost,
        "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "metadata": metadata or {},
    }


def _compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    prices = PRICES.get(model)
    if prices is None:
        for key in PRICES:
            if model.startswith(key) or key.startswith(model.split(":")[0]):
                prices = PRICES[key]
                break
    if prices is None:
        prices = _DEFAULT_PRICE
    return round(prices["in"] * input_tokens + prices["out"] * output_tokens, 8)


def _detect_provider(model: str) -> str:
    m = model.lower()
    if "claude" in m:
        return "anthropic"
    if "gpt" in m or "o1" in m or "o3" in m:
        return "openai"
    if "llama" in m or "mixtral" in m or "mistral" in m or "gemma" in m:
        return "together"
    if "gemini" in m:
        return "google"
    return "unknown"


def _flush_loop():
    while True:
        time.sleep(10)
        _flush()


def _flush():
    with _lock:
        if not _queue:
            return
        batch = list(_queue)
        _queue.clear()

    batch = [e for e in batch if e is not None]
    if not batch:
        return

    try:
        httpx.post(
            _endpoint,
            json={"events": batch},
            headers={"Authorization": f"Bearer {_api_key}"},
            timeout=5.0,
        )
    except Exception:
        pass


# Auto-init if env var is set
if os.environ.get("MARGINED_API_KEY"):
    init()
