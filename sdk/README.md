# Margined Python SDK

> LLM unit economics: cost, margin, and profitability per customer and feature.

Add **one argument** to your existing LLM calls. Get gross margin per customer, cost per feature, and the price you need to charge — without changing how your app works.

```bash
pip install margined
```

## Quickstart

```python
import margined
margined.init()  # reads MARGINED_API_KEY

response = margined.track(
    client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    ),
    user_id=current_user.id,
    feature="summarize_document",
)
```

`track()` returns the **exact same response object**, unchanged. Zero risk to existing code.

## Auto-patch (zero call-site changes)

```python
import margined
margined.init()
margined.patch_anthropic()   # sync + async clients
margined.patch_openai()      # sync + async clients

# Tell Margined who the current user is (e.g. Flask):
margined.set_context(
    user_id=lambda: g.current_user.id,
    feature=lambda: request.endpoint,
)
```

Every LLM call in your app — including calls made by third-party libraries — is now tracked.

## Decorator + scoped identity

```python
@margined.feature("research_agent")
async def run_research(user, query):
    async with margined.identify(user.id):
        return await client.messages.create(...)
```

## Streaming

Streams report usage only at the end; wrap them and Margined records one event when the stream completes:

```python
stream = margined.track_stream(
    client.messages.create(..., stream=True),
    user_id=user.id, feature="chat",
)
for event in stream:
    ...
```

For OpenAI, pass `stream_options={"include_usage": True}` so the final chunk carries usage. Auto-patched clients wrap streams automatically.

## Agent runs

Group multi-step agent workflows under one run — the dashboard shows cost per run (p50/p90/p99), not just cost per call:

```python
with margined.run(user_id=user.id, feature="research_agent") as r:
    step1 = client.messages.create(...)   # auto-tracked
    step2 = client.messages.create(...)
    r.tag({"steps": 2})
```

## Guarantees

The SDK is built to the same standard as Sentry/PostHog-class telemetry SDKs:

- **Fail-open.** Tracking never raises into your application and never blocks a request thread. If Margined is down, your app is unaffected.
- **Background delivery.** Events batch in memory and flush every 5 seconds (or at 100 events) on a daemon thread, with retry + exponential backoff on transient failures.
- **Bounded memory.** The queue caps at 10,000 events and drops the oldest under sustained backpressure (drops are counted and reported).
- **No double counting.** Every event carries an idempotency key; a retried flush can never inflate your costs.
- **Cache-aware pricing.** Prompt-cache reads and writes are priced at each provider's actual discount rates, and OpenAI cached tokens are separated from the uncached input count.
- **Local cost computation.** Cost is computed from a bundled, versioned price table (`margined.PRICES_VERSION`) — no network round-trip on the hot path. The ingest API independently recomputes cost server-side, so a stale client table can't skew your dashboard.

## Providers

Anthropic, OpenAI, Google Gemini, Groq, Mistral, DeepSeek, Together AI — with prefix matching for dated model snapshots and provider-prefixed IDs (`anthropic.claude-…`, `openai/gpt-…`).

## Configuration

```python
margined.init(
    api_key="mgd_...",       # or MARGINED_API_KEY
    endpoint="https://...",  # or MARGINED_ENDPOINT (self-hosting)
    sample_rate=1.0,         # record a fraction of events
    disabled=False,          # or MARGINED_DISABLED=1 (tests/CI)
    debug=False,             # or MARGINED_DEBUG=1
)
```

## Serverless / short-lived processes

Call `margined.flush()` before the function exits (or `margined.shutdown()` to also stop the worker). The SDK also registers an atexit hook that drains the queue with a single best-effort attempt.

## Dashboard

Events appear in your [Margined dashboard](https://app.trymargined.com) in real time:

- **Gross margin per customer** — connect Stripe to see revenue vs. cost
- **Cost per feature** — which product surface burns your bill
- **Pricing calculator** — break-even and recommended prices from your real p50/p90/p99 usage
- **Margin-at-risk alerts** — email/Slack before a customer goes underwater
