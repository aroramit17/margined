# Margined reuse audit and MVP decision matrix

Audited 2026-09-14. **Decision: adopt Margined as the application codebase; retain and harden its infrastructure, extend its economics, and rework its user experience.** The repository is a useful foundation, but the audited revision is not ready for a paid beta unchanged.

Implementation update: the [first ingestion hardening pass](INGESTION_HARDENING.md) is now implemented and tested locally. The findings below describe the original audited revision; consult that implementation report for what has been fixed and what remains.

## Provenance and scope

- Upstream: https://github.com/pushkalkumar/margined
- Actual GitHub fork: https://github.com/aroramit17/margined
- Audited upstream/fork commit: `ceaa06ea9813b1a4f20b086a36abf63de8e58fae`.
- Local checkout: `/Users/Amit/Documents/ChatGPT/Tokenomics (working name)/margined`; `origin` is Amit's fork, `upstream` is the original repository.
- Development branch: `codex/margined-audit`. The audit and subsequent implementation are preserved there. The earlier standalone prototype has its own `codex/standalone-prototype-archive` branch in the fork.
- [LICENSE](../LICENSE) is MIT. Preserve its copyright and permission notice when reusing code. Review names, domains, logos, and legal-page claims separately when rebranding.
- Reviewed both SDKs, transport/extraction/pricing, all backend route modules, authentication, all three migrations, both Edge Functions, frontend authentication/API wiring and page structure, deployment instructions, and available tests.
- No application source or migration was changed for this audit. The previous standalone Next.js scaffold remains outside this checkout as reference material.

## Reuse versus rebuild matrix

“Retain and harden” means change the existing module to address a demonstrated gap. It does not mean replace its subsystem or adopt a different stack. “Extend” means add product-specific behavior to the existing foundation. Passing unit tests alone does not establish production readiness.

| Component | Existing evidence | Decision | Required delta / acceptance gate |
|---|---|---|---|
| Application architecture | `backend/app/main.py`, `frontend/src/App.tsx`, `supabase/` | **Retain** FastAPI + React/Vite + Supabase | No Next.js rewrite. Keep existing service boundaries and migrations; use additive changes. |
| Node provider instrumentation | `sdk-node/src/index.ts`, `extract.ts`; 17 SDK tests pass | **Retain and harden; extend coverage** | Keep `wrap`, `track`, async context, run IDs, stream observation. Repair provider helper compatibility; explicitly support OpenAI Responses cache/stream shapes. Test real provider client interfaces with mocked HTTP. |
| Python instrumentation | `sdk/margined/__init__.py`, `_extract.py`, `_stream.py`; 44 tests pass | **Retain** with shared correctness fixes | Preserve sync/async wrappers and streaming. Node remains the launch priority; Python already exists and need not be rebuilt. |
| SDK transport | Both `_transport.py` and `sdk-node/src/transport.ts` | **Retain and harden** | Keep bounded queues, batching, stable event IDs, retry/backoff and flush. Retry transient ingest failures/429; expose dropped-event status. Keep telemetry failure isolated from the host app. |
| Cost engine | `backend/app/pricing.py`, SDK price tables; 43 entries agree | **Retain and harden** | Preserve formula and table generator/checker. Verify launch model rates against official sources; add effective dates, persisted pricing version, provider/mode identity and cache TTL classes. Unknown models must be visibly unpriced, not silently assigned a generic price. |
| Ingestion | `backend/app/routes/ingest.py`, schemas | **Retain and harden** | Fix conflict target, transactional dedup/metering, truthful acknowledgements, bounded input, timestamp validation, metadata privacy policy, shared limits. See F1/F4/F5. |
| Raw events and daily storage | Migrations `001`–`003`, `llm_events`, `daily_rollups` | **Retain and extend** | Keep core entities/indexes. Add org/product ownership, billing-period links, model-aware aggregates, dedup receipts and retention. Do not apply the earlier standalone schema on top. |
| Rollup processing | `hourly-rollup/index.ts` | **Retain and harden** | Preserve full-day recomputation intent. Authenticate jobs; make grouping collision-safe and reads stable; handle older backfills/concurrent runs and ensure first-event visibility within onboarding's ten-minute target. |
| Supabase auth | `auth.py`, `useAuth.ts`, `Login.tsx` | **Retain and extend** | Email/password and OTP exist. Add Google, org bootstrap and tested owner isolation. Correct production redirect settings and secret handling. |
| Company and products | `projects.py`, projects table | **Extend** | Map existing project to product; add one company account per owner, account-wide product/event limits, server-enforced tier capabilities. Preserve project IDs. |
| API key management | `projects.py`, `auth.py`, plaintext `projects.api_key` | **Retain routes; harden storage** | Hash keys, return secrets once, add revocation metadata, invalidate cache on rotation. Restrict direct client writes so limits cannot be bypassed. |
| Stripe revenue integration | `stripe_routes.py`, `stripe_customers` | **Retain and complete** | Existing mapping, refresh, normalization and signature checks are useful. OAuth callback/token exchange/account persistence are absent. Add secure state, connected-account scoping, subscription records and replay-safe sync. F3 is a launch blocker. |
| Customer identity mapping | `StripeCustomerMap`, mapping UI | **Retain and extend** | Preserve app-customer → Stripe-customer mapping. Scope by company/product/connected account; handle multiple subscriptions and zero-usage subscribers. |
| Customer profitability | `customers.py`, `CustomerDetail.tsx` | **Extend** | Retain grouping and margin helper. Align costs/revenue to actual billing periods; include customers with revenue but no events and unmatched costs; add projected loss, growth, model breakdown and filters. |
| Feature economics | `features.py`, dashboard feature table | **Retain and extend** | Keep total cost/call count/share. Distinguish provider calls from feature operations using run IDs where available; no invented revenue attribution. |
| Plan profitability | `calculator.py` already groups by plan and computes usage/cost percentiles | **Extend, not build from zero** | Add stable Stripe price/plan IDs, all subscribers, total revenue/contribution, weighted margins, average cost and plan trends; correct period and small-sample percentile semantics. |
| Forecasting | `summary.py`, `daily-alerts` linear calendar-month projection | **Extend** | Add per-customer billing-period spend + seven-day run rate, prior-period comparison, projected contribution/margin and estimated loss date. Preserve deterministic calculations. |
| Pricing simulator | `calculator.py`, `PricingCalculator.tsx` | **Extend** | Keep break-even, target-margin and percentile math. Add editable plan price and selected-feature allowance; keep other feature costs unchanged. Show scenario assumptions and save/share only if later needed. |
| Recommendations | Calculator usage-cap heuristic; existing risk statuses | **Extend into a rules engine** | Reuse calculations; add explainable feature-dominance, high-p90-cost and model-evaluation suggestions with supporting figures. Do not promise quality-equivalent model savings. |
| Alerts | Alert CRUD and daily email/Slack function | **Retain and harden; extend rules** | Target-margin warning, current margin <30%, projected loss. Add authenticated scheduling, pagination, opt-in, safe destination validation, claim/retry delivery ledger and Tier 3 Slack gate. |
| Our product's billing | `billing.py`, billing accounts/usage counters | **Rework existing billing module** | Existing recurring free/starter/growth model differs from $49/$59/$69 lifetime tiers. Add verified one-time purchases, payment/refund lifecycle, account-wide entitlements and retention controls. Keep separate from customers' Stripe revenue sync. |
| UX and branding | React routes, Query client, API wrapper, charts, tables, forms | **Rework presentation; retain useful components** | Founder-first overview, attention list, customers, plans, features, simulator and integrations. Reuse existing component/data plumbing; selectively port earlier prototype visuals only where they fit. Replace Margined domains/branding/legal claims. |
| Tests/build tools | Python tests, Vitest, TypeScript builds, price sync script | **Retain and expand** | Add real database/role tests, provider contract fixtures, connected-account Stripe tests and critical browser flow checks. Review dependency audit findings; no CI workflow is present in this revision. |
| Margin Guard | No enforcement subsystem found | **Defer; later extension** | Add explicit opt-in policies and safe enforcement only after accurate measurement and recommendations are proven. No automatic throttling/routing in MVP. |
| OpenLIT | Not part of this codebase | **Secondary source only** | Evaluate a specific adapter if a documented instrumentation/telemetry requirement cannot reasonably be met by Margined. No parallel ingestion/storage stack by default. |

## Findings that must shape implementation

### F1 — Ingestion's database conflict target fails against its own schema

`backend/app/routes/ingest.py:191` sends `on_conflict="project_id,event_id"`. Migration `002_event_dedup_and_cache_tokens.sql:13` creates a **partial** unique index with `WHERE event_id IS NOT NULL`. A matching plain PostgreSQL `INSERT ... ON CONFLICT(project_id,event_id) DO NOTHING` fails with `42P10` against these migrations.

The handler falls back to a plain batch insert. A fully new batch can still insert, but a retried batch containing an existing event and a new event can fail together; both failures are then acknowledged as 202. Do not describe this as reliable idempotent batch ingestion. Repair the conflict target/constraint through an additive migration and test mixed duplicate/new batches against PostgreSQL, including concurrency.

### F2 — Usage-counter privileges and scheduled jobs need protection

`003_billing.sql:37` defines `increment_usage` as `SECURITY DEFINER`, with no EXECUTE revocation, fixed search path, caller check or nonnegative count validation. In an isolated PGlite database running all three migrations, both `anon` and `authenticated` had EXECUTE and an anonymous call changed a known project's counter to `-999`. This proves the SQL privilege issue; it is not a claim that the user's hosted project is exposed or has these migrations installed.

Both Edge Functions have `verify_jwt = false` in `supabase/config.toml:36` and `:39`; neither handler performs an alternative authorization check. They operate with a service-role client across projects. Require authenticated scheduler requests before deployment. Alert destinations are also unrestricted URLs passed to `fetch`; restrict Slack destinations, prevent unsafe redirects and escape user-derived email HTML.

### F3 — Stripe Connect is incomplete and money joins need correction

`stripe_routes.py:75` generates an OAuth URL with predictable `state=project_id`. The route inventory has no callback, code exchange, connected-account persistence or account-scoped API calls. `_fetch_customer_mrr` uses the platform key and customer alone. The subscription webhook updates all matching `stripe_customer` rows without connected-account or project scoping.

The webhook assigns MRR from one changed subscription, and sets customer MRR to zero when any subscription is deleted. That loses other active subscriptions. `_mrr_from_subscription` labels amounts USD without checking currency; an EUR 49 fixture returned `49.0`. It also does not model discounts, billing-period boundaries or non-flat pricing accurately enough for the intended product.

Retain the module and mapping functions. Complete OAuth with one-time state bound to the signed-in owner/project, verified callback and persisted account association. Store/sync subscriptions by account and subscription ID, then aggregate rather than overwriting customer totals. Initially expose an explicit supported billing subset; surface unsupported subscriptions instead of silently calculating misleading profit.

### F4 — Always-202 loses observability and retry opportunities

`ingest.py` returns 202 for invalid keys, invalid payloads, rate limits, plan limits and database failure. A synthetic endpoint check forcing **both** DB writes to raise still returned 202. Both SDK transports interpret responses below 500 as completed and drop 4xx rather than retrying.

Retain fail-open behavior in the SDK while making the ingestion response truthful. A telemetry 429/503 must not throw into the provider call, but must permit bounded retry/backoff. Expose accepted/duplicate/rejected counts and diagnostics; do not claim an event was stored merely because a request finished. There is no durable server queue before acknowledgement in this revision.

### F5 — Existing metering is unsuitable for LTD enforcement

`_record_usage_and_check` increments by attempted row count after insertion, separately from persistence. It can count duplicates when an upsert succeeds. Limit state exists only in a process cache for 120 seconds; a restart, another worker or expiration bypasses it until subsequent inserts. The cache is keyed by project, not month. Enforcement is per project while billing status sums across projects. Product creation has no tier cap.

Replace these narrow enforcement internals with an account-scoped atomic database transaction around dedup, usage and allowance checks. Keep routes and core tables. Add replay receipts that survive raw retention; ensure public project mutations cannot bypass product limits. Do not bill overages until their pricing and payment handling exist.

### F6 — Financial queries can omit data and mix time windows

Customer/feature/summary/calculator routes and the alert job do not paginate their rollup/customer queries; the repository's Supabase API limit is 1,000 rows. Customer and calculator endpoints begin from usage rows, so subscribers with zero usage are omitted. Customer “last 30 days” includes both endpoints from today minus 30, and is compared with current MRR, not matched subscription periods. Recent raw calls use an end-date midnight bound that omits the remainder of that day.

The rollup job paginates, but its delimiter-joined key breaks if customer or feature IDs contain `|`; timestamp-only ordering is unstable across tied rows, and offset pagination can race with writes. Recalculation only covers today/yesterday despite ingestion accepting arbitrary historical timestamps. Aggregates also lack model/run dimensions needed for historical model economics and feature-operation counts.

Use SQL aggregation or complete stable pagination, consistent half-open UTC periods, all-customer joins, and documented backfill handling. Keep full-day recomputation or move its transaction into SQL; do not introduce another event platform.

### F7 — Cost computation is useful; pricing validity and coverage are separate

All three tables agree on 43 models at version `2026-07-27`. This checks internal agreement, **not current provider pricing**. The table itself marks a Sonnet 5 introductory rate as ending 2026-08-31, before this audit. Rates were not comprehensively revalidated in this audit.

SDKs apply a generic fallback for unknown models, and the backend then trusts client cost for those models. Events do not persist the catalog version. Anthropic cache-write duration classes are collapsed, and provider/mode identity is not part of price resolution. Sampling below 1.0 drops events without a weight used in the backend, so it understates total costs.

A Node fixture using `input_tokens_details.cached_tokens` returned all 1,000 input tokens as uncached and zero cache reads; OpenAI Responses usage needs its own extraction support. Adopt a supported launch catalog with provenance/effective dates and test known cache shapes. Use full sampling for financial totals; visibly report incomplete telemetry and unknown costs.

### F8 — SDK interface and privacy contracts need explicit bounds

The Node proxy wraps every nested `create` method and returns `result.then(...)`. A synthetic provider promise with `.withResponse()` lost that helper after wrapping. Existing tests use fake provider responses rather than proving full compatibility with actual provider client surfaces. Stream handling covers Anthropic events and OpenAI chat usage chunks, not all provider stream interfaces. Preserve these working adapters and add focused compatibility tests before claiming broader support.

Automatic extraction does not collect prompt/response text, which is valuable. However, user-supplied `metadata` passes through unchanged and schemas ignore unknown top-level fields. Define and enforce the product's metadata policy and event size/timestamp limits. API keys are currently stored and returned in plaintext. Fix these boundaries without discarding the SDK.

### F9 — Alert and purchase lifecycle checks are partial

The alert job checks `last_fired_at` before sending but has no atomic claim. It does not check delivery HTTP status and can mark alerts sent when Resend is unconfigured; concurrent runs can duplicate notifications. Its margin rule is cost as a percentage of MRR, which is different from the new product's margin-threshold wording. Adopt an explicit rules contract and delivery ledger.

Our own billing handler grants a recurring plan from completed checkout metadata, without a verified one-time LTD price/payment lifecycle or a webhook event ledger. Subscription updates/payment failures/refunds are not comprehensively handled. Retain checkout/signature-verification structure; rework purchase and entitlement semantics for LTD.

### F10 — Dependency and operational readiness

Fresh `npm ci --ignore-scripts` succeeded using committed lockfiles. `npm audit` reported 8 affected frontend packages (4 high, 4 moderate) and 6 SDK development-tool packages (1 critical, 2 high, 3 moderate). These are advisory findings, not evidence that a deployed application is exploitable. The SDK has no declared runtime npm dependencies; its findings concern its development toolchain. Exact reports are saved under `docs/audit-evidence/`.

Triage applicable advisories and upgrade/test affected packages before exposure; do not run an indiscriminate forced upgrade. Python dependency advisory scanning remains to be done. The frontend build also reports a large initial bundle and demo code shared between static/dynamic imports. CI, hosted auth, cron authorization, real Stripe replay and browser tenant isolation remain verification work.

## Validation performed

Environment: Node `v22.22.3`, Python `3.12.13`; Python dependencies installed in the checkout's ignored `.venv`. Npm installation scripts disabled during the audit. No real provider call, customer ingestion, remote migration, notification or Stripe charge was performed.

| Check | Outcome |
|---|---|
| `.venv/bin/python -m pytest sdk/tests backend/tests -q` | **75 passed**: 44 Python SDK, 31 backend; two deprecation warnings. Backend DB interactions are mocked. |
| `.venv/bin/python scripts/check_prices.py` | **Pass**: 43 models agree, version 2026-07-27. |
| `cd sdk-node && npm test` | **17 passed**. |
| `cd sdk-node && npm run typecheck && npm run build` | **Pass**. |
| `cd frontend && npm run build` | **Pass**, with bundle/demo import warnings. |
| Actual three migrations in isolated PGlite + PostgreSQL conflict statement | Migrations apply; conflict inference **fails with 42P10**. |
| Isolated anonymous RPC call after applying migrations | **Privilege defect reproduced**; counter modified to -999. |
| Synthetic backend DB outage | **Always-202 defect reproduced**. |
| Synthetic EUR subscription | **Currency defect reproduced**: returns USD-labelled 49.0. |
| Node Responses-cache/helper fixtures | **Coverage/interface gaps reproduced**. |
| Supabase client construction using synthetic local JWT | Pass; no network call. |
| Local Supabase CLI status | Full service stack unavailable: Docker/Podman not installed. No hosted database test substituted. |
| Npm dependency audits | Findings saved; no package upgrades made. |

PGlite exercises PostgreSQL SQL/role behavior; it does not exercise Supabase's gateway, deployed permissions or Edge runtime. Pure/synthetic checks are described as such. Tests and builds passed at the unchanged upstream revision, not at a hypothetical fixed revision.

## Implementation handoff

Follow [MVP_BUILD_SPEC.md](MVP_BUILD_SPEC.md). Work inside this fork. First harden the retained data path and Stripe connection; then extend economics and LTD controls; then rework the founder-facing experience using the existing React app. Carry forward the previous prototype only as a source of reviewed visual/algorithmic ideas, not a second live backend.

The user reports having created a Supabase project. Reuse it after confirming its identity and migration state. Do not execute the old scaffold's “Connect real data” steps. No OpenLIT adoption is justified by this audit yet: the identified gaps can be addressed within Margined's existing boundaries.
