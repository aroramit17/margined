"""
Streaming wrappers: track cost for streamed responses.

Streams only report usage at the end (Anthropic: message_delta carries final
output_tokens; OpenAI: the last chunk carries `usage` when
`stream_options={"include_usage": True}`). These wrappers pass every event
through untouched and record one event when the stream completes.
"""

from __future__ import annotations

from typing import Any, Callable, Optional

from ._extract import build_event_from_usage, usage_from_obj

Recorder = Callable[[dict[str, Any]], None]


class _StreamState:
    def __init__(self, user_id: str, feature: str, run_id: Optional[str],
                 metadata: Optional[dict], record: Recorder):
        self.user_id = user_id
        self.feature = feature
        self.run_id = run_id
        self.metadata = metadata
        self.record = record
        self.model: Optional[str] = None
        self.input_tokens = 0
        self.output_tokens = 0
        self.cache_read = 0
        self.cache_write = 0
        self.done = False

    def observe(self, event: Any) -> None:
        try:
            event_type = getattr(event, "type", None)
            if event_type == "message_start":
                # Anthropic: message_start carries model + input token counts
                message = getattr(event, "message", None)
                if message is not None:
                    self.model = getattr(message, "model", None) or self.model
                    usage = getattr(message, "usage", None)
                    if usage is not None:
                        u = usage_from_obj(usage)
                        self.input_tokens = u["input_tokens"]
                        self.cache_read = u["cache_read_tokens"]
                        self.cache_write = u["cache_write_tokens"]
            elif event_type == "message_delta":
                usage = getattr(event, "usage", None)
                if usage is not None:
                    tokens = getattr(usage, "output_tokens", None)
                    if tokens:
                        self.output_tokens = int(tokens)
            elif getattr(event, "usage", None) is not None and hasattr(event, "choices"):
                # OpenAI final chunk (include_usage)
                u = usage_from_obj(event.usage)
                self.model = getattr(event, "model", None) or self.model
                self.input_tokens = u["input_tokens"]
                self.output_tokens = u["output_tokens"]
                self.cache_read = u["cache_read_tokens"]
            elif hasattr(event, "choices") and self.model is None:
                self.model = getattr(event, "model", None)
        except Exception:
            pass

    def finish(self) -> None:
        if self.done:
            return
        self.done = True
        try:
            if self.input_tokens == 0 and self.output_tokens == 0:
                return  # nothing observed — no usage in stream
            usage = {
                "input_tokens": self.input_tokens,
                "output_tokens": self.output_tokens,
                "cache_read_tokens": self.cache_read,
                "cache_write_tokens": self.cache_write,
            }
            event = build_event_from_usage(
                usage, self.model or "unknown", self.user_id, self.feature,
                self.run_id, self.metadata,
            )
            self.record(event)
        except Exception:
            pass


class TrackedStream:
    """Wraps a sync stream iterator; transparent pass-through."""

    def __init__(self, inner: Any, state: _StreamState):
        self._inner = inner
        self._state = state

    def __iter__(self):
        try:
            for event in self._inner:
                self._state.observe(event)
                yield event
        finally:
            self._state.finish()

    def __enter__(self):
        entered = self._inner.__enter__() if hasattr(self._inner, "__enter__") else self._inner
        return TrackedStream(entered, self._state) if entered is not self._inner else self

    def __exit__(self, *args):
        try:
            return self._inner.__exit__(*args) if hasattr(self._inner, "__exit__") else None
        finally:
            self._state.finish()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)


class TrackedAsyncStream:
    """Wraps an async stream iterator; transparent pass-through."""

    def __init__(self, inner: Any, state: _StreamState):
        self._inner = inner
        self._state = state

    async def __aiter__(self):
        try:
            async for event in self._inner:
                self._state.observe(event)
                yield event
        finally:
            self._state.finish()

    async def __aenter__(self):
        entered = await self._inner.__aenter__() if hasattr(self._inner, "__aenter__") else self._inner
        return TrackedAsyncStream(entered, self._state) if entered is not self._inner else self

    async def __aexit__(self, *args):
        try:
            if hasattr(self._inner, "__aexit__"):
                return await self._inner.__aexit__(*args)
        finally:
            self._state.finish()

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)
