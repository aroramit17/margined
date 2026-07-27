"""
Margined — LLM unit economics tracking.

Know which AI features are profitable. Know which customers are costing
you money.

Three integration modes:

    # Mode 1 — explicit wrapper (one argument, per-call control)
    import margined
    margined.init()  # reads MARGINED_API_KEY

    response = margined.track(
        client.messages.create(...),
        user_id=current_user.id,
        feature="summarize_document",
    )

    # Mode 2 — auto-patch (zero call-site changes)
    margined.patch_anthropic()
    margined.patch_openai()
    margined.set_context(user_id=lambda: g.user.id, feature=lambda: request.endpoint)

    # Mode 3 — decorator (per-function feature tagging)
    @margined.feature("research_agent")
    def run_research(user):
        with margined.identify(user.id):
            ...

The SDK is fail-open by design: it never raises into your application,
never blocks a request thread, and drops data before it degrades your app.
"""

from __future__ import annotations

import contextvars
import functools
import logging
import os
import random
import threading
import time
import uuid
from typing import Any, Callable, Optional, Union

from ._extract import build_event, extract_usage, usage_from_obj  # noqa: F401
from ._pricing import (  # noqa: F401
    PRICES,
    PRICES_VERSION,
    compute_cost,
    detect_provider,
    resolve_price,
)
from ._stream import TrackedAsyncStream, TrackedStream, _StreamState
from ._transport import Transport, debug_enabled

__version__ = "0.2.0"
__all__ = [
    "init",
    "track",
    "track_stream",
    "run",
    "feature",
    "identify",
    "set_context",
    "patch_anthropic",
    "patch_openai",
    "flush",
    "shutdown",
    "compute_cost",
    "PRICES",
    "PRICES_VERSION",
]

logger = logging.getLogger("margined")

_DEFAULT_ENDPOINT = "https://api.trymargined.com/ingest"

_client: Optional[Transport] = None
_disabled = False
_sample_rate = 1.0

# Context vars — safe across asyncio tasks and threads
_ctx_user_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "margined_user_id", default=None
)
_ctx_feature: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "margined_feature", default=None
)
_ctx_run_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "margined_run_id", default=None
)

# Callables for dynamic context (e.g. Flask g, FastAPI request state)
_user_id_fn: Optional[Callable[[], Optional[str]]] = None
_feature_fn: Optional[Callable[[], Optional[str]]] = None

_patched: set[str] = set()


# ──────────────────────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────────────────────

def init(
    api_key: Optional[str] = None,
    endpoint: Optional[str] = None,
    *,
    sample_rate: float = 1.0,
    disabled: bool = False,
    debug: bool = False,
) -> None:
    """Initialize the SDK. Call once at app startup.

    Args:
        api_key: Project API key. Falls back to MARGINED_API_KEY.
        endpoint: Ingest endpoint override. Falls back to MARGINED_ENDPOINT.
        sample_rate: Fraction of events to record (1.0 = all). Cost totals
            are NOT extrapolated server-side — use sampling only when
            approximate numbers are acceptable.
        disabled: No-op mode for tests/CI. Also via MARGINED_DISABLED=1.
        debug: Log SDK activity at WARNING level. Also via MARGINED_DEBUG=1.
    """
    global _client, _disabled, _sample_rate
    _disabled = disabled or os.environ.get("MARGINED_DISABLED", "").lower() in ("1", "true")
    _sample_rate = max(0.0, min(1.0, sample_rate))
    key = api_key or os.environ.get("MARGINED_API_KEY")
    if _disabled or not key:
        return
    resolved_endpoint = endpoint or os.environ.get("MARGINED_ENDPOINT") or _DEFAULT_ENDPOINT
    if _client is not None:
        if _client.api_key == key and _client.endpoint == resolved_endpoint:
            return
        _client.shutdown()
    _client = Transport(key, resolved_endpoint, debug=debug or debug_enabled())


def flush() -> None:
    """Synchronously flush queued events. Call before exit in serverless."""
    if _client is not None:
        try:
            _client.flush()
        except Exception:
            pass


def shutdown() -> None:
    """Flush and stop the background worker."""
    global _client
    if _client is not None:
        _client.shutdown()
        _client = None


def _record(event: Optional[dict[str, Any]]) -> None:
    if event is None or _client is None or _disabled:
        return
    if _sample_rate < 1.0 and random.random() >= _sample_rate:
        return
    _client.enqueue(event)


# ──────────────────────────────────────────────────────────────
# Mode 1 — explicit wrapper
# ──────────────────────────────────────────────────────────────

def track(
    response: Any,
    *,
    user_id: str,
    feature: str,
    run_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> Any:
    """Transparent pass-through: returns `response` unchanged, records cost async.

    Never raises. Adds sub-millisecond overhead (one dict build + queue append).
    """
    if _client is None or _disabled:
        return response
    try:
        rid = run_id or _ctx_run_id.get()
        _record(build_event(response, user_id, feature, rid, metadata))
    except Exception:
        logger.debug("margined: track failed", exc_info=True)
    return response


def track_stream(
    stream: Any,
    *,
    user_id: str,
    feature: str,
    run_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> Any:
    """Wrap a streaming response. Records one event when the stream completes.

    Works with Anthropic `stream=True` iterators and OpenAI chat-completion
    streams (pass `stream_options={"include_usage": True}` to OpenAI so the
    final chunk carries usage).

        stream = margined.track_stream(
            client.messages.create(..., stream=True),
            user_id=user.id, feature="chat",
        )
        for event in stream: ...
    """
    if _client is None or _disabled:
        return stream
    try:
        state = _StreamState(user_id, feature, run_id or _ctx_run_id.get(), metadata, _record)
        if hasattr(stream, "__aiter__"):
            return TrackedAsyncStream(stream, state)
        return TrackedStream(stream, state)
    except Exception:
        return stream


# ──────────────────────────────────────────────────────────────
# Context — powers auto-patch mode and decorators
# ──────────────────────────────────────────────────────────────

def set_context(
    user_id: Union[str, Callable[[], Optional[str]], None] = None,
    feature: Union[str, Callable[[], Optional[str]], None] = None,
) -> None:
    """Set ambient user/feature context for auto-patch mode.

    Pass a string for static context, or a callable for per-request context:

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


class identify:
    """Scope a user_id via context manager: `with margined.identify(user.id): ...`"""

    def __init__(self, user_id: str):
        self.user_id = str(user_id)
        self._token: Optional[contextvars.Token] = None

    def __enter__(self) -> "identify":
        self._token = _ctx_user_id.set(self.user_id)
        return self

    def __exit__(self, *args: Any) -> None:
        if self._token is not None:
            _ctx_user_id.reset(self._token)

    async def __aenter__(self) -> "identify":
        return self.__enter__()

    async def __aexit__(self, *args: Any) -> None:
        self.__exit__(*args)


def feature(name: str) -> Callable:
    """Decorator: tag all LLM calls inside the function with a feature name.

        @margined.feature("summarize_document")
        def summarize(user, doc):
            with margined.identify(user.id):
                return client.messages.create(...)
    """

    def decorator(fn: Callable) -> Callable:
        if _is_coroutine(fn):

            @functools.wraps(fn)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                token = _ctx_feature.set(name)
                try:
                    return await fn(*args, **kwargs)
                finally:
                    _ctx_feature.reset(token)

            return async_wrapper

        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            token = _ctx_feature.set(name)
            try:
                return fn(*args, **kwargs)
            finally:
                _ctx_feature.reset(token)

        return wrapper

    return decorator


def _is_coroutine(fn: Callable) -> bool:
    import inspect

    return inspect.iscoroutinefunction(fn)


def _resolve_context() -> tuple[Optional[str], Optional[str]]:
    user_id = _ctx_user_id.get()
    feature_name = _ctx_feature.get()
    if user_id is None and _user_id_fn is not None:
        try:
            user_id = _user_id_fn()
        except Exception:
            user_id = None
    if feature_name is None and _feature_fn is not None:
        try:
            feature_name = _feature_fn()
        except Exception:
            feature_name = None
    return user_id, feature_name


def _record_from_context(response: Any) -> None:
    """Record a response using ambient context (auto-patch mode)."""
    if _client is None or _disabled:
        return
    try:
        user_id, feature_name = _resolve_context()
        if user_id is None:
            return  # no context — skip silently
        _record(
            build_event(response, user_id, feature_name or "untagged", _ctx_run_id.get(), None)
        )
    except Exception:
        logger.debug("margined: auto-track failed", exc_info=True)


# ──────────────────────────────────────────────────────────────
# Mode 2 — auto-patch
# ──────────────────────────────────────────────────────────────

def patch_anthropic() -> None:
    """Auto-track all Anthropic Messages calls (sync + async). Idempotent.

    Call once at startup, then set context via `set_context` / `identify`.
    """
    if "anthropic" in _patched:
        return
    try:
        import anthropic.resources.messages as messages_module

        _wrap_create(messages_module.Messages, "create", is_async=False)
        async_cls = getattr(messages_module, "AsyncMessages", None)
        if async_cls is not None:
            _wrap_create(async_cls, "create", is_async=True)
        _patched.add("anthropic")
    except Exception:
        logger.debug("margined: patch_anthropic failed", exc_info=True)


def patch_openai() -> None:
    """Auto-track all OpenAI chat-completion calls (sync + async). Idempotent."""
    if "openai" in _patched:
        return
    try:
        import openai.resources.chat.completions as completions_module

        _wrap_create(completions_module.Completions, "create", is_async=False)
        async_cls = getattr(completions_module, "AsyncCompletions", None)
        if async_cls is not None:
            _wrap_create(async_cls, "create", is_async=True)
        _patched.add("openai")
    except Exception:
        logger.debug("margined: patch_openai failed", exc_info=True)


def _wrap_create(cls: Any, method_name: str, is_async: bool) -> None:
    original = getattr(cls, method_name)

    if is_async:

        @functools.wraps(original)
        async def tracked_async(self: Any, *args: Any, **kwargs: Any) -> Any:
            response = await original(self, *args, **kwargs)
            if kwargs.get("stream"):
                return _wrap_ambient_stream(response)
            _record_from_context(response)
            return response

        setattr(cls, method_name, tracked_async)
    else:

        @functools.wraps(original)
        def tracked(self: Any, *args: Any, **kwargs: Any) -> Any:
            response = original(self, *args, **kwargs)
            if kwargs.get("stream"):
                return _wrap_ambient_stream(response)
            _record_from_context(response)
            return response

        setattr(cls, method_name, tracked)


def _wrap_ambient_stream(stream: Any) -> Any:
    try:
        user_id, feature_name = _resolve_context()
        if user_id is None:
            return stream
        state = _StreamState(user_id, feature_name or "untagged", _ctx_run_id.get(), None, _record)
        if hasattr(stream, "__aiter__"):
            return TrackedAsyncStream(stream, state)
        return TrackedStream(stream, state)
    except Exception:
        return stream


# ──────────────────────────────────────────────────────────────
# Agent runs
# ──────────────────────────────────────────────────────────────

class run:
    """Group multi-step agent calls under one run_id.

        with margined.run(user_id=user.id, feature="research_agent") as r:
            step1 = client.messages.create(...)   # auto-tracked if patched
            step2 = margined.track(client.messages.create(...),
                                   user_id=user.id, feature="research_agent")
            r.tag({"steps": 2})

    Explicit `track()` calls inside the block inherit the run_id
    automatically. The dashboard aggregates cost per run (p50/p90/p99).
    """

    def __init__(self, user_id: str, feature: str, metadata: Optional[dict] = None):
        self.user_id = str(user_id)
        self.feature = str(feature)
        self.run_id = f"run_{uuid.uuid4().hex[:16]}"
        self.metadata = metadata or {}
        self._tokens: list[contextvars.Token] = []

    def __enter__(self) -> "run":
        self._tokens = [
            _ctx_user_id.set(self.user_id),
            _ctx_feature.set(self.feature),
            _ctx_run_id.set(self.run_id),
        ]
        return self

    def __exit__(self, *args: Any) -> None:
        for var, token in zip((_ctx_user_id, _ctx_feature, _ctx_run_id), self._tokens):
            try:
                var.reset(token)
            except Exception:
                pass
        self._tokens = []

    async def __aenter__(self) -> "run":
        return self.__enter__()

    async def __aexit__(self, *args: Any) -> None:
        self.__exit__(*args)

    def tag(self, extra: dict[str, Any]) -> None:
        self.metadata.update(extra)


# `margined.track.run(...)` alias kept for backward compatibility
track.run = run  # type: ignore[attr-defined]


# ──────────────────────────────────────────────────────────────
# Backward-compatible internal aliases (used by tests / integrations)
# ──────────────────────────────────────────────────────────────

def _compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    return compute_cost(model, input_tokens, output_tokens)


def _detect_provider(model: str) -> str:
    return detect_provider(model)


def _extract_event(response, user_id, feature, run_id, metadata):
    return build_event(response, user_id, feature, run_id, metadata)


# Auto-init if the env var is present
if os.environ.get("MARGINED_API_KEY"):
    init()
