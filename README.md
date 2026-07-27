<div align="center">

# Margined

**The unit economics layer for AI SaaS — gross margin per customer, cost per feature, and the price you need to charge.**

[![PyPI](https://img.shields.io/pypi/v/margined?color=blue)](https://pypi.org/project/margined/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Python 3.9+](https://img.shields.io/badge/python-3.9%2B-blue)](sdk/pyproject.toml)
[![Tests](https://img.shields.io/badge/tests-67%20passing-brightgreen)](#development)

[Cloud](https://app.trymargined.com) · [Quickstart](docs/quickstart.md) · [SDK reference](docs/sdk-reference.md) · [Self-host](docs/self-hosting.md)

</div>

---

Your Anthropic bill says what you spend. Stripe says what you earn. Nothing connects them — so when the invoice doubles, you can't answer the only question that matters: **am I making money on this customer?**

Margined joins per-call LLM cost (tagged by customer and feature) with Stripe revenue:

| Customer | Plan | MRR | LLM cost (30d) | Gross margin | |
|----------|------|-----|----------------|--------------|---|
| acme_corp | Scale | $299 | $14.20 | 95.3% | 🟢 |
| user_devon | Starter | $29 | $41.80 | **-44.1%** | 🔴 |
| globex_ai | Growth | $99 | $8.95 | 91.0% | 🟢 |
| initech | Growth | $99 | $47.12 | 52.4% | 🟡 |

Observability tools (Langfuse, LangSmith) answer *"why did this trace fail?"* Margined answers *"is customer X profitable?"* — it's a finance layer, not a debugger.

## Quickstart (under 5 minutes)

```bash
pip install margined
```

```python
import margined
margined.init()  # reads MARGINED_API_KEY

response = margined.track(
    client.messages.create(...),   # your existing call, unchanged
    user_id=current_user.id,
    feature="summarize_document",
)
```

That's the whole integration. `track()` is a transparent pass-through — it returns the exact same response object and never raises or blocks. Prefer zero call-site changes? `margined.patch_anthropic()` / `margined.patch_openai()` auto-instrument every call (sync, async, and streaming).

Seed a demo project without touching your app:

```bash
python scripts/seed_demo.py --api-key mgd_your_key
```

## What you get

- **Gross margin per customer** — LLM cost joined with Stripe MRR. Color-coded: green above 70%, red when a customer costs more than they pay.
- **Cost per feature** — every call is tagged with a feature name; see which product surface is 60% of your bill.
- **Pricing calculator** — break-even and recommended prices computed from your real p50/p90/p99 usage per plan tier, with usage-cap suggestions to stop P99 margin bleed.
- **Agent run economics** — group multi-step agent calls under one run; see p50/p90/p99 cost per run.
- **Margin-at-risk alerts** — email/Slack when a customer's LLM cost crosses a threshold of their MRR, a feature crosses a spend line, or the projected bill runs hot.

## Accuracy is the product

Cost numbers are only useful if they're right:

- **Cache-aware pricing.** Anthropic cache writes bill at 1.25×, cache reads at 0.1×; OpenAI cached input tokens are discounted and excluded from the uncached count. Margined tracks all four token classes per call.
- **Versioned price table** covering Anthropic, OpenAI, Google, Groq, Mistral, DeepSeek, and Together, dated (`PRICES_VERSION`) and applied both client-side and server-side — the ingest API independently recomputes every cost from raw token counts, so stale or tampered client values never reach your dashboard.
- **Idempotent ingestion.** Every event carries a client-generated ID; retried flushes can't double-count.
- **Streaming support.** Wrapped streams record usage from the final stream event, including cache tokens.

## Architecture

```
┌─────────────┐   batched, fail-open   ┌──────────────┐        ┌────────────────┐
│  Python SDK │ ─────────────────────▶ │  FastAPI     │ ─────▶ │  Supabase      │
│ (your app)  │      POST /ingest      │  ingest API  │        │  Postgres      │
└─────────────┘                        └──────────────┘        │  · llm_events  │
                                                               │  · rollups     │
┌─────────────┐    OAuth / webhooks    ┌──────────────┐        │  · RLS         │
│   Stripe    │ ─────────────────────▶ │  MRR sync    │ ─────▶ └───────┬────────┘
└─────────────┘                        └──────────────┘                │
                                                                       ▼
                       ┌───────────────────┐              ┌─────────────────────┐
                       │ Edge functions    │              │  React dashboard    │
                       │ · hourly rollup   │              │  margin · features  │
                       │ · daily alerts    │              │  pricing calculator │
                       └───────────────────┘              └─────────────────────┘
```

- `sdk/` — Python SDK (`pip install margined`): bounded queue, background flush with backoff, atexit drain, py.typed
- `backend/` — FastAPI: ingest (rate-limited, deduped, server-priced), dashboard API, Stripe integration
- `frontend/` — React + Vite + Tailwind (shadcn tokens, dark-first)
- `supabase/` — schema migrations (RLS on every table) + edge functions (idempotent rollups, alert delivery)

## Self-hosting

Everything in this repo runs on your own Supabase project + any Python host. See [docs/self-hosting.md](docs/self-hosting.md).

```bash
supabase db push && supabase functions deploy hourly-rollup daily-alerts
cd backend && pip install -r requirements.txt && uvicorn app.main:app
cd frontend && npm install && npm run dev
```

## Development

```bash
cd sdk && pip install -e ".[dev]" && pytest              # 44 SDK tests
cd backend && pip install -r requirements.txt && pytest  # 23 API tests
cd frontend && npm install && npx tsc --noEmit && npm run build
```

## FAQ

**How is this different from Langfuse / LangSmith / Portkey?**
They stop at cost per trace or per tag. Margined ingests revenue (Stripe) and computes margin — plus a pricing calculator that turns usage data into a pricing decision. Use them together: observability for debugging, Margined for the P&L.

**Does the SDK add latency?**
No. Cost is computed locally from a bundled price table and events are queued to a background thread. The hot-path overhead is one dict build and a queue append.

**What if Margined is down?**
Nothing happens to your app. The SDK is fail-open: it retries with backoff, bounds its memory, and drops data before it ever degrades your service.

**What about non-LLM COGS?**
Today Margined tracks LLM spend. Vector DB / GPU / third-party API cost lines are on the roadmap.

## License

MIT
