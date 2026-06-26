# Margined Python SDK

> Know which AI features are profitable. Know which customers are costing you money.

Add **one argument** to your existing LLM calls. Get a dashboard showing LLM cost per customer, feature profitability, and gross margin — without changing how your app works.

## Install

```bash
pip install margined
```

## Quickstart — Auto-patch (recommended)

Two lines. No call-site changes. Tracks every LLM call in your app automatically.

```python
import margined
margined.patch_anthropic()   # intercepts all anthropic.Anthropic() calls
margined.patch_openai()      # intercepts all openai.OpenAI() calls

# Tell Margined who the current user is (e.g. Flask):
margined.set_context(
    user_id=lambda: g.current_user.id,
    feature=lambda: request.endpoint,
)
```

That's it. Every LLM call in your app — including calls from third-party libraries — is now tracked.

## Alternative — Explicit wrapper

For per-call control:

```python
margined.init(api_key="your-api-key")

response = margined.track(
    client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    ),
    user_id=current_user.id,
    feature="summarize_document",
)
```

`track()` returns the **exact same response object**, unchanged. Zero risk to existing code.

## Agent Runs

For multi-step agent workflows, group all calls under one run:

```python
with margined.track.run(user_id=user.id, feature="research_agent") as run:
    step1 = client.messages.create(...)   # auto-tracked
    step2 = client.messages.create(...)   # auto-tracked
    run.tag({"steps": 2, "cached": False})
# Total cost of the entire agent run recorded as one unit
```

## Supported Providers

| Provider | Models |
|----------|--------|
| Anthropic | claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5 |
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo |
| Groq | llama-3.1-70b, llama-3.1-8b, mixtral-8x7b |
| Together AI | Meta Llama, Mixtral |

Cost is computed **locally** from a bundled price table — no extra round-trip latency.

## Serverless / Edge

In serverless environments, call `margined.flush()` before the function exits to ensure events are sent:

```python
# At the end of your handler:
margined.flush()
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MARGINED_API_KEY` | Your project API key (auto-initializes SDK) |

## Dashboard

Events appear in your [Margined dashboard](https://app.trymargined.com) in real time. The dashboard shows:

- **LLM cost per customer** — who is costing you the most?
- **Feature profitability** — which features are margin drains?
- **Gross margin per customer** — connect Stripe to see revenue vs. cost
- **Pricing calculator** — what do you need to charge to hit 70% gross margin?
