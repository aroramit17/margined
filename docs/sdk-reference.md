# SDK Reference (Python)

`pip install margined` · Python 3.9+ · fully typed (`py.typed`)

## `margined.init(...)`

```python
margined.init(
    api_key: str | None = None,    # falls back to MARGINED_API_KEY
    endpoint: str | None = None,   # falls back to MARGINED_ENDPOINT
    *,
    sample_rate: float = 1.0,      # fraction of events to record
    disabled: bool = False,        # no-op mode (or MARGINED_DISABLED=1)
    debug: bool = False,           # log SDK activity (or MARGINED_DEBUG=1)
)
```

Call once at startup. Setting `MARGINED_API_KEY` before import auto-initializes. Without a key the SDK is a complete no-op.

Note on `sample_rate`: totals are **not** extrapolated server-side. Sample only when approximate cost is acceptable.

## `margined.track(response, *, user_id, feature, run_id=None, metadata=None)`

Transparent pass-through. Extracts usage from any Anthropic Messages or OpenAI Chat Completions response (objects or dicts), computes cache-aware cost locally, queues an event, and returns the response unchanged. Never raises.

## `margined.track_stream(stream, *, user_id, feature, ...)`

Wraps a streaming response (sync or async iterator, or context manager). Passes every event through untouched and records one cost event when the stream completes:

- **Anthropic** `stream=True`: reads input/cache tokens from `message_start`, output tokens from `message_delta`.
- **OpenAI**: reads the final usage chunk — pass `stream_options={"include_usage": True}`.

## `margined.patch_anthropic()` / `margined.patch_openai()`

Monkey-patch the provider clients (sync + async, including `stream=True` calls) so every call is tracked with ambient context. Idempotent; silently no-ops if the provider package isn't installed. Calls with no resolvable `user_id` are skipped; calls with a user but no feature are tagged `"untagged"`.

## Context

```python
margined.set_context(user_id=..., feature=...)   # strings or zero-arg callables
with margined.identify(user_id): ...              # scoped user (sync or async with)

@margined.feature("name")                         # scoped feature (sync or async def)
def handler(...): ...
```

Context uses `contextvars`, so it's safe across threads and asyncio tasks. Resolution order: explicit argument → `identify`/`feature`/`run` scope → `set_context` callable.

## `margined.run(user_id=..., feature=...)`

Context manager grouping multi-step agent calls under one generated `run_id`:

```python
with margined.run(user_id=uid, feature="research_agent") as r:
    ...   # every tracked call inside inherits r.run_id
    r.tag({"steps": 3})
```

## `margined.flush()` / `margined.shutdown()`

`flush()` synchronously drains the queue (serverless: call before the handler returns). `shutdown()` also stops the background worker. An atexit hook performs a single best-effort drain automatically.

## Pricing helpers

```python
margined.compute_cost(model, input_tokens, output_tokens,
                      cache_read_tokens=0, cache_write_tokens=0) -> float
margined.PRICES          # the bundled price table (USD per token)
margined.PRICES_VERSION  # date string, e.g. "2026-07-27"
```

Model resolution tolerates dated snapshots (`claude-haiku-4-5-20251001`), provider prefixes (`anthropic.claude-opus-5`, `openai/gpt-4o`), and prefers the longest prefix match (`gpt-4o-mini-...` never matches `gpt-4o`). Unknown models still get a mid-tier estimate client-side, but ingestion rejects them with 422 until a verified server price exists. Do not treat that client fallback as a recorded cost.

## Delivery semantics

| Property | Behavior |
|---|---|
| Enqueue | O(1), never blocks, never raises |
| Flush cadence | Every 5 s, or immediately at 100 queued events |
| Batch size | 100 events per request |
| Retry | 3 attempts, exponential backoff + jitter; failed batches requeue once |
| Queue bound | 10,000 events; oldest dropped under backpressure (drop count reported) |
| 408 / 429 / 5xx | Retry with bounded backoff; honor Retry-After without blocking flush |
| Other 4xx from ingest | Entire batch rejected, diagnostic emitted, no retry |
| Idempotency | Every event has a stable `event_id`; transactional receipts prevent duplicate usage counting, including after raw-event pruning |
| Exit | Best-effort drain; an active Retry-After cooldown is respected and queued data is not durable |

## Event schema

```json
{
  "event_id": "uuid",
  "customer_id": "user_abc",
  "feature": "summarize_document",
  "run_id": "run_1a2b… | null",
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "input_tokens": 1240,
  "output_tokens": 380,
  "cache_read_tokens": 900,
  "cache_write_tokens": 0,
  "cost_usd": 0.0094,
  "occurred_at": "2026-07-27T14:32:00Z",
  "metadata": {}
}
```
