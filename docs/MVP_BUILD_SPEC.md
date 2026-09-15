# MVP build spec — Margined-first

**First clone and audit Margined. Produce a reuse-vs-rebuild matrix before writing any new application code.**

That first step is complete in [MVP_REUSE_AUDIT.md](MVP_REUSE_AUDIT.md), against upstream commit `ceaa06ea9813b1a4f20b086a36abf63de8e58fae`. This document supersedes the earlier greenfield architecture and setup instructions. Product scope comes from the supplied MVP brief; where its implementation suggestions conflict with this document, the Margined-first architecture governs.

## Architecture and reuse rules

Use https://github.com/aroramit17/margined as the starting codebase and retain https://github.com/pushkalkumar/margined as `upstream`.

```text
Margined Node/Python instrumentation
  → retained bounded SDK transport
  → hardened FastAPI ingestion and server pricing
  → Supabase raw events + daily aggregates
  → billing-period customer / plan / feature economics
  → reworked React/Vite founder dashboard

Retained Stripe mapping/sync module + completed Connect flow
  → account-scoped subscription and plan records
  → revenue joins for the same billing periods

Existing calculator + summary + alerts
  → profitability / forecasting / simulator / recommendations

Existing product billing module
  → one-time LTD purchases + account limits + retention

Later: explicit opt-in Margin Guard
```

1. Keep FastAPI, React/Vite, Supabase Auth/Postgres, SDK directories, ingestion/storage, pricing and useful backend/frontend components.
2. Implement focused fixes in those modules before adding parallel replacements. Record a concrete requirement or demonstrated defect for any replacement.
3. Extend existing calculator, customer, feature, summary and alert code rather than duplicating their calculations across services.
4. Use additive migrations after upstream `001`–`003`. Preserve project/customer identities and existing raw usage. Review any migration requiring a backfill or destructive change separately.
5. Retain MIT attribution. Change product branding, SDK package identity, domains, OAuth redirects and legal text before release; never send our users' telemetry to upstream defaults.
6. The earlier standalone Next.js app is reference material. Selectively port useful visual elements and tested formulas into Margined after review. Do not run its backend or apply its schema as the product foundation.
7. OpenLIT is a secondary infrastructure source. Evaluate only when a named telemetry requirement or measured limitation warrants it. Preserve one ingestion contract, event ledger and cost source of truth.

## Outcome

A founder connects Stripe and instruments OpenAI/Anthropic, then sees meaningful customer, plan and feature economics within ten minutes. The first paid beta answers: who is profitable, who is approaching a loss, which feature drives cost, which plan has weak economics, and what pricing/allowance change could help.

## Work sequence and acceptance gates

### 1. Make the retained foundation dependable

- Fix F1/F2/F4/F5 from the audit: conflict handling, restricted RPCs and jobs, meaningful ingest results, transactionally deduplicated account-wide usage and limit enforcement.
- Preserve full event capture for financial totals; report dropped/unpriced/incomplete telemetry explicitly. Keep SDK host calls fail-open, with bounded retries and serverless flush support.
- Hash/revoke SDK keys, validate event timestamps/token classes/metadata, enforce project ownership at API and database boundaries.
- Repair rollup grouping/pagination/backfill behavior; provide prompt aggregate updates for the ten-minute onboarding target. Retain model and run dimensions where history needs them.
- Validate the launch model catalog against official provider sources, attach effective dates and persist pricing provenance. Support OpenAI/Anthropic text/cache modes explicitly, including documented unsupported modes.
- Test actual provider client interfaces using local mocked HTTP: normal and streamed calls, async context isolation, helper methods, cancellation, missing usage, duplicate retries and flush failures. No paid call is necessary for these contract tests.
- Triage and address dependency advisories; retain lockfiles and add repeatable CI for the existing tests, builds, price checks and database regressions.

**Gate:** real PostgreSQL integration tests demonstrate tenant isolation, restricted role execution, mixed duplicate/new batch handling, one count per accepted event, concurrent account limits, safe key revocation and rollup reconciliation. Fault injection must never acknowledge unstored usage as successfully stored. Authorized jobs work; unauthorized jobs fail.

### 2. Finish Stripe and account/product setup

- Reuse Supabase login and project CRUD. Add Google login, one company per owner and product mapping without replacing upstream project IDs.
- Complete read-only Stripe Connect OAuth with random, single-use, expiring state bound to the authenticated owner and target company; persist the verified connected account and support disconnection.
- Extend existing Stripe mapping/refresh/webhook functions. Persist subscription/price IDs, currency, quantities, supported recurring amounts, status and period boundaries; scope every API read and webhook reconciliation by connected account.
- Handle multiple subscriptions, deletion of only one subscription, repeated/out-of-order webhooks and interrupted paginated sync. Re-fetch authoritative state where needed.
- For the first supported revenue contract, start with undiscounted flat licensed USD monthly subscriptions; display unsupported cases and reasons. Add other billing forms only with tested normalization semantics.
- Keep revenue with zero usage and usage with no revenue visible. A connected Stripe account is revenue input; our own LTD checkout is a separate billing concern.

**Gate:** a Stripe test-account integration reconciles two customers and multiple subscriptions, including cancellation, with no account leakage or silent currency mixing. The user-created Supabase project is identified and inspected before applying migrations; the earlier standalone migration is not applied.

### 3. Extend the economics engine

- Contribution = supported period subscription revenue − estimated AI usage cost in that same period. Margin = contribution / revenue; percentage is undefined for zero revenue. Label current-period values as partial, and separate current from projected margin.
- Extend customer views with plan, revenue, cost, contribution, margin, feature/model breakdown, daily trend, growth and projected-loss filters.
- Extend calculator plan grouping: stable plan/price IDs, customer counts including zero-usage subscribers, total revenue, average cost, total contribution, revenue-weighted margin and p50/p90/p99 cost. Never average customer margin percentages to obtain company/plan margin.
- Retain feature costs/share/average logic. Distinguish provider calls from feature operations: reuse run IDs for grouped workflows; otherwise label counts as calls.
- Extend deterministic forecast: period spend to date + recent seven-day daily average × remaining period days, with explicit treatment of missing/partial days. Add prior-period comparison and estimated loss date when calculable; expose sparse-data limitations.
- Extend the pricing calculator with price and selected-feature allowance inputs. Scale only selected-feature cost, preserve unrelated costs, and show contribution/margin/p90 effects. State proportional-usage, fixed-customer-count and no-churn assumptions.
- Add deterministic recommendations using target-margin shortfalls, feature concentration above 60%, plan p90 cost above 50% of price and costly-model workflow concentration. Include the figures and period behind each suggestion.

**Gate:** company/customer/plan/feature totals reconcile on shared fixtures; period-edge costs, zero revenue, zero usage and mixed subscriptions remain visible. Scenario changes affect only their intended inputs. Forecasts are deterministic and recommendations are explainable.

### 4. Rework our billing for LTD and alerts

| Capability | Tier 1 | Tier 2 | Tier 3 |
|---|---:|---:|---:|
| One-time price from original brief | $49 | $59 | $69 |
| Accepted events per account/month | 10,000 | 20,000 | 30,000 |
| Products | 1 | 3 | 5 |
| Providers | OpenAI + Anthropic | All supported | All supported |
| Customer margins / feature costs | Yes | Yes | Yes |
| Plan margins / pricing simulator | No | Yes | Yes |
| Forecasting | No | No | Yes |
| Email alerts | Yes | Yes | Yes |
| Slack alerts | No | No | Yes |
| Raw retention | 30 days | 60 days | 90 days |
| Aggregate history | No scheduled expiry | No scheduled expiry | No scheduled expiry |

- Rework existing checkout/account module for verified one-time purchases, exact configured Stripe Price IDs, successful payment state, event replay protection and refund/revocation handling. No automatic full-feature entitlement for every new signup in a paid launch.
- Enforce capabilities at the API as well as the UI; compute any required internal risk signal without exposing a gated forecast view. Keep product limits, monthly allowances and retention account-scoped.
- Define the month boundary as UTC ingestion month and count only newly accepted events. Reject excess events with a clear limit diagnostic. Recurring overage sales remain disabled until rates and consent/payment handling are defined.
- Preserve aggregates and sufficient dedup receipts when pruning raw events. Choose an accepted replay/backfill window that makes retention safe; protect any needed billing-boundary records.
- Retain alert CRUD/delivery adapters; implement warning below owner target, critical below 30%, and projected loss below 0%. Deliver opted-in dashboard/email signals and Tier 3 Slack signals with atomic claims, retryable failures and safe destinations.

**Gate:** tiers enforce the published feature matrix; concurrent ingestion/product creation cannot bypass limits; retention does not erase aggregate history or enable duplicate charges/counts. Duplicate, unpaid and refunded checkout cases are tested. No real notification is sent without authorization.

### 5. Rework UX and branding on retained React components

Retain router, Query/API wiring, forms, useful charts/tables and authenticated navigation. Rework the overview around AI margin, revenue, contribution, a clear attention list and revenue-versus-cost trend. Add dedicated customer, plan, feature and simulator views. Put setup status and incomplete data explanations where they help a founder act. Reuse the earlier prototype's visual ideas selectively.

The interface should describe product results rather than implementation machinery. Keep current/projection/unsupported labels accurate, show empty/error/sync states, and ensure demo data cannot be mistaken for live data. Do not invent customer testimonials, product performance claims or legal assurances while replacing branding.

**Gate:** browser checks cover signup, product selection, first-event confirmation, Stripe mapping, customer detail, plan comparison, allowance simulation, tier gates and mobile layout. First-run onboarding must reach a useful live result within the target without waiting for an hourly rollup.

## Deferred

Margin Guard enforcement, automatic routing/throttling, prompt/debugging/tracing products, model evaluation, credits, customer invoicing, non-LLM cloud FinOps, SSO and granular RBAC. The minimal entitlement logic for selling this product is required; a general-purpose entitlement-management product is not.

## Setup continuation

The prior scaffold's “Connect real data” instructions are obsolete for this architecture. Keep the Supabase project the user already created. Inspect its project reference, schema and auth state, then apply Margined's reviewed migrations plus the targeted fixes. Configure Margined's backend/frontend environments privately and point both SDKs at our API. Resume Stripe test connection after its callback/account scoping is implemented. Do not create another Supabase project or send telemetry to the upstream hosted service by default.
