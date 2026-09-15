> Architecture amendment, 2026-09-14: This original brief is retained as product requirements. The [Margined-first build specification](../margined/docs/MVP_BUILD_SPEC.md) supersedes its optional reuse and stack suggestions. Clone/audit Margined and produce the reuse matrix before new application code; extend the fork rather than rebuilding from scratch.

Here’s the MVP I’d build. The goal is to get to a **sellable LTD/private-beta product fast**, not recreate Langfuse or CloudZero.

## MVP goal

A founder connects Stripe + their AI providers and answers, within 10 minutes:

- Which customers are profitable?
- Which customers are becoming unprofitable?
- Which features consume the most AI spend?
- Which pricing tier has the worst economics?
- What should I change?

That is the product.

## Phase 1 — Core data plumbing

Build these first:

| Component | MVP scope |
|---|---|
| Auth | Email/password + Google |
| Organization | One company account |
| Products | 1–5 apps per account depending on tier |
| Stripe | OAuth connection + customers, subscriptions, plans, MRR |
| AI telemetry | OpenAI + Anthropic first |
| SDK | Node.js first |
| Customer identity | Map app user/workspace → Stripe customer |
| Feature tagging | `feature: "deep-research"` |
| Cost calculation | Model + tokens → actual estimated request cost |
| Storage | Raw events + daily aggregates |

The basic SDK should be extremely simple:

```javascript
import { Inferlytic } from "@inferlytic/sdk";

Inferlytic.init({
  apiKey: process.env.INFERLYTIC_KEY
});

Inferlytic.identify({
  customerId: stripeCustomerId,
  userId: user.id
});
```

Optional:

```javascript
Inferlytic.feature("deep-research");
```

Then the SDK automatically records supported OpenAI/Anthropic calls.

---

# Phase 2 — The money engine

This is the real IP.

For every Stripe billing period:

```text
Customer revenue
-
AI/API COGS
=
AI contribution
```

And:

```text
AI contribution ÷ revenue
=
AI gross margin
```

We need calculations at four levels:

### Company

Revenue: $34,200  
AI COGS: $5,820  
AI margin: **83%**

### Customer

Acme

Revenue: $99  
AI COGS: $41  
Margin: **58.6%**

### Plan

Pro — $49

Avg AI COGS: $17  
Avg margin: **65%**

### Feature

Deep Research

12,820 executions  
$4,201 AI cost  
$0.33 average cost/run

Those four views are enough for V1.

---

# Phase 3 — Main dashboard

Do not make this look like developer observability software.

The homepage should show:

## AI Margin

**83.2%**

Revenue  
$34,200

AI COGS  
$5,746

AI Contribution  
$28,454

Then:

### Needs Attention

🔴 3 customers projected to become unprofitable

🟡 Pro plan margin dropped from 72% → 61%

🟡 Deep Research costs increased 38%

🟢 Switching one workflow could potentially reduce costs

Then a simple chart:

**Revenue vs AI COGS over time**

---

# Phase 4 — Customer profitability

Probably the most important screen.

| Customer | Plan | Revenue | AI Cost | Margin |
|---|---|---:|---:|---:|
| Acme | Business | $499 | $42 | 91.6% |
| Globex | Pro | $99 | $31 | 68.7% |
| Initech | Pro | $99 | $61 | 38.4% |
| Stark | Starter | $49 | $58 | **-18.4%** |

Filters:

- Profitable
- Below target margin
- Projected loss
- Highest spend
- Highest cost growth

Click a customer and show:

- revenue
- AI cost
- current margin
- projected month-end cost
- feature breakdown
- model breakdown
- daily usage trend

---

# Phase 5 — Plan profitability

This is one of the strongest differentiators.

Example:

### Starter — $19

182 customers  
Avg AI cost: $2.91  
Margin: 84.7%

### Pro — $49

82 customers  
Avg AI cost: $19.82  
Margin: 59.6%

### Unlimited — $99

21 customers  
Avg AI cost: $78.40  
Margin: **20.8%**

Then show:

> Unlimited is your least profitable plan despite being your most expensive plan.

That is the kind of insight founders pay for.

---

# Phase 6 — Feature economics

User tags product actions like:

```text
chat
deep-research
image-generation
transcription
report-generation
```

Then:

| Feature | Runs | AI Cost | Avg Cost | % Spend |
|---|---:|---:|---:|---:|
| Chat | 28K | $630 | $0.02 | 14% |
| Deep Research | 6K | $2,720 | $0.45 | 61% |
| Images | 3K | $811 | $0.27 | 18% |
| Summaries | 14K | $312 | $0.02 | 7% |

MVP does **not** need perfect revenue attribution by feature yet.

Just knowing:

> "Deep Research consumes 61% of your AI budget."

is already valuable.

---

# Phase 7 — Forecasting

Keep this deterministic in V1.

Use:

- spend this billing period
- days elapsed
- 7-day average
- previous billing-period behavior

Output:

### Acme

Current spend: $28.44

Projected month-end: **$58.31**

Subscription revenue: $49

Projected contribution: **-$9.31**

> Acme is projected to become unprofitable in approximately 9 days.

No machine-learning project required.

---

# Phase 8 — Alerts

User chooses target margin:

**60%**

Rules:

### Warning

Margin <60%

### Critical

Margin <30%

### Loss risk

Projected margin <0%

Deliver through:

- dashboard
- email

Higher LTD tiers:

- Slack

Example:

> **Margin Alert**
>
> Acme's projected AI margin fell to 24%.
>
> Deep Research is responsible for 71% of its AI spend.

---

# Phase 9 — Pricing simulator

This should be in the first paid product.

Choose a plan:

**Pro — $49**

Current:

100 Deep Research operations included

Average customer AI cost:

$18.40

Current margin:

62.4%

Change price:

$49 → $59

or allowance:

100 → 60

Then instantly calculate:

**Projected margin: 74.3%**

This is simple math but high perceived value.

---

# Phase 10 — Recommendation engine

For MVP, use rules first instead of fancy AI.

Examples:

### Rule

Customer margin < target because feature X represents >60% of spend.

Recommendation:

> Deep Research accounts for 72% of this customer's AI cost. Consider reducing included usage or moving this customer to a higher plan.

### Rule

Plan p90 AI cost is >50% of subscription price.

Recommendation:

> 10% of Pro customers are approaching unprofitable usage levels.

### Rule

A higher-priced model dominates a simple tagged workflow.

Recommendation:

> `document-summary` represents $1,240/month in spend. Consider evaluating a lower-cost model.

AI can rewrite the recommendation into nice language, but the underlying logic should be deterministic.

---

# MVP integrations

Launch with:

### Required

- Stripe
- OpenAI
- Anthropic

### Very soon after

- Gemini
- OpenRouter

### Post-validation

- Fal
- Replicate
- ElevenLabs
- Groq
- Together
- Azure OpenAI

Do not delay launch trying to support every provider.

---

# LTD tiers

I’d launch roughly like this:

| | Tier 1 | Tier 2 | Tier 3 |
|---|---:|---:|---:|
| Price | **$49** | **$59** | **$69** |
| Events/mo | 10K | 20K | 30K |
| Products | 1 | 3 | 5 |
| Providers | 2 | All supported | All supported |
| Customer margins | ✅ | ✅ | ✅ |
| Feature costs | ✅ | ✅ | ✅ |
| Plan margins | — | ✅ | ✅ |
| Forecasting | — | — | ✅ |
| Pricing simulator | — | ✅ | ✅ |
| Email alerts | ✅ | ✅ | ✅ |
| Slack | — | — | ✅ |
| Raw retention | 30 days | 60 days | 90 days |
| Aggregate history | Lifetime | Lifetime | Lifetime |

Overages become recurring revenue.

---

# What I would NOT build

This matters almost as much as what we build.

Do not build initially:

- prompt management
- prompt debugging
- complete tracing UI
- model evaluation suite
- billing/invoicing
- credits
- entitlement management
- model routing
- automated throttling
- cloud FinOps
- AWS/GCP/Azure cost ingestion
- SSO
- granular RBAC
- SOC 2 workflows
- mobile app

Those can all wait.

---

# Recommended stack

Given the open-source foundation we found:

### Frontend
Next.js / React

### Backend
FastAPI or TypeScript API

### Database
Postgres/Supabase initially

### Event processing
Batch ingestion

### Aggregation
Daily/hourly rollup jobs

### Billing
Stripe

### Auth
Supabase Auth or Clerk

### Email
Resend

### Slack
Webhook integration

### Analytics engine
SQL first

### Optional telemetry foundation
Reuse pieces from Margined/OpenLIT after code audit

No need to build an elaborate streaming architecture on Day 1.

---

# Build order

I’d sequence it like this:

### Sprint 1
Auth  
organizations  
products  
Stripe sync  
basic schema

### Sprint 2
Node SDK  
OpenAI integration  
Anthropic integration  
event ingestion  
cost calculation

### Sprint 3
customer mapping  
customer profitability  
company margin dashboard

### Sprint 4
feature economics  
plan economics  
forecasting

### Sprint 5
alerts  
pricing simulator  
LTD limits  
billing/checkout

### Sprint 6
onboarding polish  
documentation  
sample app  
admin tools  
private beta fixes

At that point you have something sellable.

---

# Definition of “MVP is ready”

I would not judge readiness by feature count.

It is ready when a founder can:

1. Sign up.
2. Connect Stripe.
3. Install the SDK.
4. Send real usage.
5. Open the dashboard.
6. See an actual customer that is expensive or unprofitable.
7. Understand why.
8. Get a recommended pricing/usage action.

That full loop is the MVP.

And the core headline remains:

> **Know exactly what every AI customer costs you — before usage destroys your margins.**
