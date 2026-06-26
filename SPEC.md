# Margined — Full Product Spec

**Tagline:** Know which AI features are profitable. Know which customers are costing you money. Ship the pricing that actually works.

**Working title:** Margined  
**Domain candidates:** `trymargined.com` · `margined.dev`  
**Generated:** June 24–25, 2026

---

## The Gap (Why This Is Novel)

Every existing tool is built for the ML engineer's job: debug LLM calls, trace failures, run evals.

| Tool | Who it's for | What it answers |
|------|-------------|-----------------|
| Langfuse | ML engineers | Why did this trace fail? |
| Helicone | ML engineers | What's my token usage? |
| Braintrust | ML engineers | Which prompt is better? |
| CloudZero | Finance teams | Where is cloud spend going? |
| **Margined** | **Founders** | **Am I making money on this customer?** |

The three questions no existing tool answers under $100/month:

1. **"Is customer X profitable?"** — LLM cost to serve vs. what they're paying you in Stripe.
2. **"Which feature is a margin drain?"** — Feature-level LLM COGS ranked by cost.
3. **"What do I need to charge to hit 70% gross margin?"** — Break-even pricing calculator.

This is not an observability tool. It is an **LLM unit economics layer** — the financial intelligence layer that sits between your LLM provider bills and your Stripe revenue.

---

## Target Customer (Exact)

Solo founders and small teams (1–5 people) who have shipped an AI SaaS with real users and a real Anthropic/OpenAI bill. Specifically:

- 3–18 months post-launch
- $2K–$30K MRR
- LLM bill growing 15–40% month-over-month
- No one person owns "unit economics" — the founder is simultaneously CTO, product, and finance
- Currently using Helicone or Langfuse free tier, or nothing at all

**The trigger moment:** They look at their Anthropic bill and it's $800 this month, up from $300 last month. They open their Stripe dashboard. They have no idea which customers or features caused the jump. That is the moment they will pay for Margined.

---

## Core Feature Set

### Feature 1 — SDK Shim (The Entry Point)

A Python package (`pip install margined`) that wraps any LLM provider call with one additional argument:

```python
import anthropic
from margined import track

client = anthropic.Anthropic()

# Before:
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}]
)

# After (one argument added):
response = track(
    client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    ),
    user_id=current_user.id,         # required
    feature="summarize_document",    # required
    run_id=request_id,               # optional — for agent runs
    metadata={"plan": "starter"}     # optional
)
```

`track()` is a transparent pass-through: it returns the exact same response object unchanged. Zero risk to existing code. Under 5ms overhead (async fire-and-forget to the ingest API).

The SDK also works as a context manager for streaming and multi-step agent runs:

```python
with track.run(user_id=user.id, feature="research_agent") as run:
    step1 = client.messages.create(...)   # auto-tracked
    step2 = client.messages.create(...)   # auto-tracked
    run.tag({"steps": 2, "cached": False})
# Total cost of the entire agent run is recorded as one unit
```

**Why this matters:** The SDK is the distribution moat. Once it's installed in 50 codebases, switching cost is real. Publish to PyPI on day 1. Node.js SDK in week 5.

**Supported providers at launch:** Anthropic, OpenAI, Groq, Together AI. Cost is computed locally from a price table bundled with the SDK — no round-trip latency. Price table is versioned and auto-updated via a lightweight endpoint.

---

### Feature 2 — Customer Economics Dashboard (The Novel Core)

The dashboard has three panels.

**Panel A: Customer Cost Table**

| Customer | Plan | MRR | LLM Cost (30d) | Gross Margin | Status |
|----------|------|-----|-----------------|--------------|--------|
| Acme Corp | Growth | $149 | $8.40 | 94.4% | ✅ |
| John D. | Starter | $49 | $31.20 | -36.3% | 🔴 Margin Alert |
| Spotify LLC | Growth | $149 | $4.10 | 97.2% | ✅ |

- **MRR column** comes from Stripe (OAuth connection).
- **LLM Cost** comes from SDK events.
- **Gross Margin** = `(MRR - LLM Cost) / MRR × 100`. This column does not exist in any competitor under $250/month.
- **Status** is color-coded: green (>70% margin), yellow (40–70%), red (<40% or margin-negative).

Clicking any customer opens a breakdown: cost by feature, cost over time, most expensive calls.

**Panel B: Feature Profitability Ranking**

| Feature | Total Cost (30d) | Calls | Avg Cost/Call | % of LLM Bill |
|---------|------------------|-------|---------------|----------------|
| `research_agent` | $312.40 | 1,204 | $0.26 | 61% |
| `summarize_document` | $88.10 | 8,900 | $0.010 | 17% |
| `chat_assistant` | $62.20 | 12,440 | $0.005 | 12% |
| `generate_report` | $51.30 | 203 | $0.25 | 10% |

This answers: "My research_agent feature is 61% of my LLM bill. Is it generating 61% of my revenue, or is it dragging margin?" No competitor surfaces this.

**Panel C: Monthly Trend**

Three line charts:
- Total LLM cost (actual + projected to month end)
- LLM cost per paying customer (normalized)
- Gross margin trend (if Stripe connected)

The projection is simple linear extrapolation from current month-to-date — no ML required.

---

### Feature 3 — Margin-at-Risk Alerts

Two alert types, configured per project:

**Customer Alert:** "Customer [X] has crossed a margin threshold."
- Trigger: LLM cost exceeds N% of their subscription MRR (default: 50%).
- Delivered via: email, Slack webhook, or in-app.
- Example: "John D. (Starter, $49/mo) has incurred $31.20 in LLM costs this month — 64% of their subscription. Current margin: -36%."

**Feature Alert:** "Feature [Y] has crossed a spend threshold."
- Trigger: Feature's monthly LLM cost exceeds a set dollar amount (default: $100/month).
- Example: "`research_agent` has crossed $300 this month. On track for $420 by month end (+40% vs. last month)."

**Bill Alert:** "Your LLM bill is tracking toward $X."
- Trigger: projected month-end spend exceeds a set threshold.
- Fires once, early in the month, so the founder has time to act.

Alerts go to Slack (webhook URL, no OAuth needed) and email. Config is a 30-second form.

---

### Feature 4 — Pricing Calculator (The Differentiator)

This feature has no equivalent anywhere in the market.

**Input:**
- Target gross margin (default: 70%)
- Model mix (auto-detected from their actual usage, or manually set)
- Expected calls per customer per month (auto-detected from p50 customer usage, or manually set)

**Output:**
```
To achieve 70% gross margin with your current usage patterns:

  Plan: Starter (current avg: 4,200 calls/month, $2.10 LLM COGS)
  Break-even price: $7.00/month
  Recommended price: $29/month  → 92.8% gross margin

  Plan: Growth (current avg: 22,000 calls/month, $11.00 LLM COGS)
  Break-even price: $36.67/month
  Recommended price: $99/month  → 88.9% gross margin

  ⚠ Your current Starter plan ($19/month) yields 89% margin at median usage,
    but your top-10% heaviest users drive margin below 40%.
    Consider adding a usage cap at 15,000 calls/month on the Starter plan.
```

This is the feature that justifies the subscription for any founder who has stared at their Anthropic bill wondering if their pricing model makes sense. It turns raw cost data into a pricing decision.

---

### Feature 5 — Agent Run Tracking

For users building multi-step agent workflows, a single agent run may involve 5–20 LLM calls across different models. The SDK's context manager groups all calls in a run into one record:

```
Run: research_agent | user: user_123 | 2026-06-24 14:32
  Step 1: claude-sonnet-4-6 | 1,240 in / 380 out | $0.0062
  Step 2: claude-haiku-4-5  | 840 in / 120 out   | $0.0008
  Step 3: claude-sonnet-4-6 | 2,100 in / 680 out | $0.0105
  ─────────────────────────────────────────────────────────
  Total: $0.0175 / run | p50 cost/run: $0.0142 | Trend: ↑12%
```

The dashboard shows: cost per agent run (not just cost per call), p50/p90/p99 run costs, and run cost trend over time.

---

## Data Model

### Supabase Schema

```sql
-- Projects (one per codebase/product)
CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users NOT NULL,
  name        TEXT NOT NULL,
  api_key     TEXT UNIQUE NOT NULL DEFAULT gen_api_key(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- LLM call events (append-only, high volume)
CREATE TABLE llm_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects NOT NULL,
  customer_id   TEXT NOT NULL,        -- user_id from SDK
  feature       TEXT NOT NULL,        -- feature tag from SDK
  run_id        TEXT,                 -- optional: groups agent steps
  model         TEXT NOT NULL,        -- e.g. "claude-sonnet-4-6"
  provider      TEXT NOT NULL,        -- "anthropic" | "openai" | "groq"
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      NUMERIC(10,8) NOT NULL, -- computed by SDK, stored here
  metadata      JSONB DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL   -- timestamp from SDK, not server
);

-- Indexes for dashboard queries
CREATE INDEX idx_events_project_customer ON llm_events (project_id, customer_id, occurred_at DESC);
CREATE INDEX idx_events_project_feature  ON llm_events (project_id, feature, occurred_at DESC);

-- Stripe customer map (links SDK user_id to Stripe customer)
CREATE TABLE stripe_customers (
  project_id      UUID REFERENCES projects NOT NULL,
  customer_id     TEXT NOT NULL,        -- matches SDK user_id
  stripe_customer TEXT NOT NULL,        -- Stripe customer ID
  current_mrr_usd NUMERIC(8,2),         -- cached from Stripe, refreshed daily
  plan_name       TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, customer_id)
);

-- Alert configs
CREATE TABLE alert_configs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID REFERENCES projects NOT NULL,
  alert_type     TEXT NOT NULL,   -- "margin_threshold" | "feature_spend" | "bill_forecast"
  threshold      NUMERIC NOT NULL,
  channel        TEXT NOT NULL,   -- "email" | "slack"
  destination    TEXT NOT NULL,   -- email address or Slack webhook URL
  last_fired_at  TIMESTAMPTZ,
  enabled        BOOLEAN DEFAULT TRUE
);

-- Pre-aggregated daily rollups (for fast dashboard queries)
-- Populated by a background job every hour
CREATE TABLE daily_rollups (
  project_id    UUID REFERENCES projects NOT NULL,
  date          DATE NOT NULL,
  customer_id   TEXT NOT NULL,
  feature       TEXT NOT NULL,
  total_calls   INTEGER NOT NULL DEFAULT 0,
  total_cost    NUMERIC(10,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, date, customer_id, feature)
);
```

**Schema notes:**
- `llm_events` is append-only; all dashboard queries hit `daily_rollups`.
- The rollup job runs every hour via a Supabase Edge Function (cron trigger).
- `cost_usd` is computed client-side in the SDK using a bundled price table — eliminates a round-trip; ingest endpoint is a pure write (< 5ms server-side).
- `customer_id` in `llm_events` is the value the founder passes as `user_id=` in the SDK — their internal ID, not a Margined-generated one. No SDK change required if they already tag LLM calls with user context.

---

## API Design

### Ingest Endpoint (public, SDK-facing)

```
POST /ingest
Authorization: Bearer {project_api_key}

Body (single event):
{
  "customer_id": "user_abc123",
  "feature": "summarize_document",
  "run_id": "run_xyz",           // optional
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "input_tokens": 1240,
  "output_tokens": 380,
  "cost_usd": 0.006200,
  "occurred_at": "2026-06-24T14:32:00Z",
  "metadata": {}
}

Body (batch — preferred, up to 100 events):
{
  "events": [ ... ]
}

Response: 202 Accepted (always — no validation errors exposed to SDK)
```

The ingest endpoint accepts batches because the SDK queues events locally and flushes every 10 seconds or at 50 events (whichever comes first).

### Dashboard Endpoints (private, auth-gated)

```
GET /projects/{project_id}/customers
  ?from=2026-06-01&to=2026-06-30
  Returns: [ { customer_id, total_cost, mrr, margin, plan, alert_status } ]

GET /projects/{project_id}/customers/{customer_id}
  Returns: cost by feature, cost over time (daily), top 10 most expensive calls

GET /projects/{project_id}/features
  Returns: [ { feature, total_cost, call_count, avg_cost_per_call, pct_of_bill } ]

GET /projects/{project_id}/summary
  Returns: total_cost_mtd, projected_month_end, pct_change_vs_last_month,
           customers_at_risk, top_cost_driver_feature

GET /projects/{project_id}/pricing-calculator
  ?target_margin=0.70
  Returns: break_even_price per plan tier, recommended_price, cap_recommendation
```

All dashboard endpoints query `daily_rollups`, not `llm_events` directly. P50 response time target: < 200ms.

---

## SDK — Complete Implementation

```python
# margined/__init__.py — the entire public API

import os
import time
import threading
import httpx
from typing import Any, Optional

_api_key: Optional[str] = None
_endpoint = "https://api.trymargined.com/ingest"
_queue: list = []
_lock = threading.Lock()

def init(api_key: str = None, endpoint: str = None):
    global _api_key, _endpoint
    _api_key = api_key or os.environ.get("MARGINED_API_KEY")
    if endpoint:
        _endpoint = endpoint
    t = threading.Thread(target=_flush_loop, daemon=True)
    t.start()

def track(response: Any, *, user_id: str, feature: str,
          run_id: str = None, metadata: dict = None) -> Any:
    """Transparent pass-through — returns response unchanged, records cost async."""
    if _api_key is None:
        return response
    try:
        event = _extract_event(response, user_id, feature, run_id, metadata)
        with _lock:
            _queue.append(event)
    except Exception:
        pass  # never raise — tracking must never break the app
    return response

class run:
    """Context manager for multi-step agent runs."""
    def __init__(self, user_id: str, feature: str, metadata: dict = None):
        self.user_id = user_id
        self.feature = feature
        self.run_id = f"run_{int(time.time() * 1000)}"
        self.metadata = metadata or {}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def tag(self, extra: dict):
        self.metadata.update(extra)

def _extract_event(response, user_id, feature, run_id, metadata):
    usage = getattr(response, 'usage', None)
    if usage is None:
        return None
    model = getattr(response, 'model', 'unknown')
    input_tokens = getattr(usage, 'input_tokens', None) or getattr(usage, 'prompt_tokens', 0)
    output_tokens = getattr(usage, 'output_tokens', None) or getattr(usage, 'completion_tokens', 0)
    cost = _compute_cost(model, input_tokens, output_tokens)
    return {
        "customer_id": user_id,
        "feature": feature,
        "run_id": run_id,
        "model": model,
        "provider": _detect_provider(model),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost,
        "occurred_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "metadata": metadata or {},
    }

PRICES = {
    "claude-opus-4-8":           {"in": 0.000015,  "out": 0.000075},
    "claude-sonnet-4-6":         {"in": 0.000003,  "out": 0.000015},
    "claude-haiku-4-5-20251001": {"in": 0.0000008, "out": 0.000004},
    "gpt-4o":                    {"in": 0.0000025, "out": 0.0000100},
    "gpt-4o-mini":               {"in": 0.00000015,"out": 0.0000006},
}

def _compute_cost(model, input_tokens, output_tokens):
    prices = PRICES.get(model, {"in": 0.000003, "out": 0.000015})
    return round(prices["in"] * input_tokens + prices["out"] * output_tokens, 8)

def _detect_provider(model):
    if "claude" in model:  return "anthropic"
    if "gpt" in model:     return "openai"
    if "llama" in model or "mixtral" in model: return "together"
    return "unknown"

def _flush_loop():
    while True:
        time.sleep(10)
        _flush()

def _flush():
    with _lock:
        if not _queue:
            return
        batch = _queue[:]
        _queue.clear()
    try:
        httpx.post(
            _endpoint,
            json={"events": batch},
            headers={"Authorization": f"Bearer {_api_key}"},
            timeout=5.0,
        )
    except Exception:
        pass  # failed flush silently dropped — observability must never fail the app
```

---

## Frontend: Screen-by-Screen

### Screen 1 — Onboarding (5 steps, < 10 min total)

1. **Name your project.** Text field. Done.
2. **Install the SDK.** `pip install margined`. Copy API key. Copy-paste code snippet.
3. **Send a test event.** Auto-detect first event arrival. Green checkmark when received. Show cost breakdown.
4. **Connect Stripe** (optional). OAuth flow. "We'll pull customer subscriptions to calculate gross margin." Can skip and add later.
5. **Set one alert.** Default: email alert when any customer's LLM cost exceeds 50% of their subscription MRR.

### Screen 2 — Customer Dashboard (main view)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Margined              [Jun 2026 ▾]    [⚠ 2 alerts]    [Settings]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  LLM Cost MTD: $487.20    On track for: $812  (+41% vs last mo)    │
│  Paying customers: 34     At-risk customers: 3 (margin < 40%)      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  CUSTOMERS                                                          │
│                                                                     │
│  Customer        Plan      MRR     Cost (30d)  Margin   Status     │
│  ─────────────────────────────────────────────────────────────────  │
│  user_john       Starter   $49     $31.20      -36%     🔴 Risk    │
│  user_acme       Growth    $149    $8.40       94%      ✅          │
│  user_spotify    Growth    $149    $4.10       97%      ✅          │
│  user_maria      Starter   $49     $22.10      55%      🟡 Watch   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  FEATURES                          MONTHLY TREND                    │
│                                                                     │
│  research_agent    $312  61%  📈    [line chart: cost vs time]      │
│  summarize_doc     $88   17%                                        │
│  chat_assistant    $62   12%  [Stripe not connected — add to see    │
│  generate_report   $51   10%   revenue overlay]                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Screen 3 — Customer Drilldown

Click any customer row:
- Cost over time (30-day bar chart)
- Cost by feature (horizontal bar, for this customer only)
- Last 20 LLM calls (model, feature, tokens, cost, timestamp)
- Subscription history if Stripe connected
- Action: "Add to watchlist" → weekly digest for this customer

### Screen 4 — Pricing Calculator

```
┌──────────────────────────────────────────────────────────────────┐
│  Pricing Calculator                                              │
│                                                                  │
│  Target gross margin:  [70%        ▾]                           │
│                                                                  │
│  Based on your actual usage data (last 30 days):                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                  STARTER TIER CUSTOMERS                │     │
│  │  Median usage:       4,200 calls/month                 │     │
│  │  Median LLM COGS:    $2.10/month                       │     │
│  │  P90 usage:          18,400 calls/month                │     │
│  │  P90 LLM COGS:       $9.20/month                       │     │
│  │                                                        │     │
│  │  Break-even price:   $7.00/month (at median usage)     │     │
│  │  For 70% margin:     $29/month  ✅ (you're charging    │     │
│  │                                   $49 — you're fine)   │     │
│  │                                                        │     │
│  │  ⚠ P90 users at $49/month: margin = 81% ✅             │     │
│  │  ⚠ P99 users at $49/month: margin = 23% 🔴             │     │
│  │  → Consider a usage cap at 25,000 calls/month on       │     │
│  │    Starter to protect against P99 margin bleed.        │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  [Growth tier]  [Custom tier]  [Export for pricing deck]        │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4-Week Build Plan

### Week 1 — SDK + Ingest Pipeline

| Day | Task |
|-----|------|
| 1–2 | SDK: `_extract_event()` for Anthropic + OpenAI, `_compute_cost()`, batch queue, `track()` function, unit tests |
| 3–4 | FastAPI ingest endpoint: API key auth, batch insert to Supabase `llm_events` |
| 5 | `run` context manager (basic), README, publish `margined` to PyPI, smoke test in own project |

**Milestone:** SDK on PyPI. Events flowing to Supabase.

---

### Week 2 — Dashboard Core

| Day | Task |
|-----|------|
| 1–2 | Supabase Auth (email + Google OAuth), create project flow, API key generation |
| 3–5 | Hourly rollup Edge Function → `daily_rollups`; customer table endpoint + UI; feature table endpoint + UI; summary bar; date range picker |

**No Stripe yet. No margin column yet.** Product is already useful — founders can see most expensive customers.

**Milestone:** Sign up → install SDK → see customer cost table. This is the v0 for beta users.

---

### Week 3 — Stripe Integration + Margin Column

| Day | Task |
|-----|------|
| 1–2 | Stripe OAuth (Connect), pull customer subscriptions + MRR, persist to `stripe_customers`, customer matching UI |
| 3–4 | Margin column in customer table, margin-at-risk badge + alert logic, pricing calculator screen (p50/p90/p99 cost per tier → break-even + recommendations) |
| 5 | Alert config form, email delivery (Resend API), Slack webhook delivery, daily alert cron job |

**Milestone:** Full margin column. Pricing calculator working. Alerts firing.

---

### Week 4 — Billing + Onboarding + Ship

| Day | Task |
|-----|------|
| 1–2 | Stripe Checkout for Margined billing (Free / Starter $49 / Growth $149), usage enforcement (event count per month) |
| 3–4 | 5-step onboarding wizard, customer drilldown screen, mobile-responsive layout, empty states, error states |
| 5 | Landing page, 3-page docs site (quickstart, SDK reference, Stripe integration), rate limiting on `/ingest`, ship |

**Milestone:** Product live, billing enabled, first 3 beta customers paying.

---

## MVP Cut Line

**Must ship at week 4:**
- SDK (Anthropic + OpenAI)
- Customer cost table
- Feature cost table
- Monthly trend chart
- Stripe integration + margin column
- Margin threshold alert (email only)
- Margined's own billing

**Cut to week 5 if behind:**
- Agent run context manager
- Pricing calculator
- Slack alerts
- Node.js SDK
- Customer drilldown detail view

The product ships without the pricing calculator. It does **not** ship without the margin column — that is the novel core.

---

## Pricing

| Tier | Price | Limits | Key Features |
|------|-------|--------|--------------|
| Free | $0 | 100K calls/month, 1 project | Cost dashboard, no Stripe |
| Starter | $49/month | 1M calls, 3 projects | Stripe integration, margin column, email alerts |
| Growth | $149/month | Unlimited, 5 seats | Pricing calculator, Slack alerts, API access, cost forecasting |

The free tier is designed to be genuinely useful (most early-stage AI SaaS does < 100K LLM calls/month). Its purpose: get the SDK installed, create the "I need the margin column" moment that drives Starter upgrades.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python) |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Frontend | React + Tailwind + shadcn/ui |
| Frontend hosting | Vercel |
| Backend hosting | Railway |
| Email alerts | Resend |
| Billing | Stripe |
| SDK | Python (PyPI: `margined`), Node.js in week 5 |
| Edge jobs | Supabase Edge Functions (hourly rollup + daily alert cron) |

---

## Launch Copy

**r/LangChain / r/LLMDevs / r/indiehackers post:**

> Your Anthropic bill grew 40% last month. Do you know which customer caused it?
>
> I built Margined — it adds one argument to your LLM calls and gives you a table showing:
> - LLM cost per customer (last 30 days)
> - Which features are costing the most
> - If you connect Stripe: gross margin per customer (is customer X profitable or a drain?)
>
> `pip install margined` → add `user_id=` and `feature=` to your existing calls → dashboard in 10 minutes.
>
> Free tier for up to 100K calls/month. No OpenTelemetry. No YAML config. No $249/month Langfuse plan.
>
> [link] — would love feedback from anyone building on Claude or GPT-4o.

---

## What Makes This Unbeatable at $49/month

1. **Margin per customer** — no competitor under $250/month shows this.
2. **Feature profitability ranking** — no competitor at any price shows this.
3. **Pricing calculator from real usage data** — does not exist anywhere.
4. **One-argument SDK** — genuinely the lowest integration friction in the category.
5. **Positioning** — "unit economics" not "observability" means you're not competing with Langfuse on their turf; you're occupying a category they haven't entered.

**The risk:** Langfuse or Helicone adding a Stripe integration + margin column. If either does, the window narrows. Ship fast — the first tool founders install tends to stay installed.

---

## Ideas Ranked (from Research Session)

| Rank | Idea | Score | Price | Path to $1k/mo |
|------|------|-------|-------|----------------|
| 1 | **LLM Cost Attribution / Unit Economics (Margined)** | 44/50 | $49/mo | 21 customers |
| 2 | AI Contract Reviewer for Freelancers | 41/50 | $29/mo | 35 customers |
| 3 | Solo Therapist EHR (SimplePractice replacement) | 40/50 | $19/mo | 53 customers |
| 4 | AI Prompt Version Control + A/B Testing | 40/50 | $49/mo | 21 customers |
| 5 | AI Changelog Generator from GitHub PRs | 40/50 | $29/mo | 35 customers |
| 6 | AI Churn Intelligence / Exit Survey Tool | 40/50 | $49/mo | 21 customers |
| 7 | AI Proposal Generator for Freelancers | 40/50 | $39/mo | 26 customers |
| 8 | AI Review Analyzer for E-commerce Sellers | 39/50 | $49/mo | 21 customers |
| 9 | Supabase Admin Panel Builder | 39/50 | $79/mo | 13 customers |
| 10 | AI Candidate Pre-Screening for SMBs | 39/50 | $59/mo | 17 customers |
