# Inferlytic

> **Architecture updated — 2026-09-14:** The product now starts from the [Margined fork](https://github.com/aroramit17/margined), checked out in `margined/`. Read the [reuse audit](margined/docs/MVP_REUSE_AUDIT.md) and [revised build spec](margined/docs/MVP_BUILD_SPEC.md). The standalone Next.js scaffold below is preserved as reference material. Its live setup instructions are superseded; do not apply its Supabase schema for the Margined-based product.

An AI unit economics application built with Next.js 16, React 19, TypeScript, Supabase/Postgres, and Stripe. This repository includes a runnable interactive demo and a configurable live backend. It is a private-beta foundation, not a production launch certification.

## Run it

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. No credentials are required for the clearly labeled sample workspace. All views, customer filters/details, charts, CSV export, demo margin preferences, and the pricing simulator work locally.

```sh
npm test            # money engine, SDK, real Postgres-compatible migration/RLS tests
npm run typecheck
npm run sdk:build
npm run test:smoke  # with the local server running
npm run build
npm start
```

## Historical prototype setup — superseded

Use the setup continuation in [Margined's revised build spec](margined/docs/MVP_BUILD_SPEC.md). The steps below document the earlier prototype only and are not the active setup plan.

1. Create a Supabase project. Apply `supabase/migrations/001_initial.sql` using the SQL editor or Supabase CLI **before signing up**. The auth trigger creates a company and first product for every user. A workspace has one owner in V1. Existing users created before the migration need their workspace inserted by an administrator.
2. Copy `.env.example` to `.env.local`. Fill the Supabase URL, public anon key, and server-only service-role key. Set `APP_URL` to the actual origin, without a trailing slash. Restart the app after adding variables.
3. In Supabase Auth, enable email/password and Google, set the site URL, and allow `${APP_URL}/auth/callback`. Google also requires its OAuth client configuration in Supabase. Visit `/login` to create the owner account. Browser auth uses PKCE; every live API verifies the user with `auth.getUser()` and scopes reads to the organization.
4. Configure Stripe Connect for Standard accounts. Add `${APP_URL}/api/stripe/callback` as an OAuth redirect URI. Set the Stripe platform secret key and client ID. Start with test mode. In **Integrations**, switch to the live workspace and connect Stripe with read-only access.
5. Configure a Stripe **connected-account** webhook at `/api/stripe/webhook` for `customer.subscription.created`, `.updated`, and `.deleted`, using `STRIPE_WEBHOOK_SECRET`. Manual sync is available in Integrations. Test these callbacks with the Stripe CLI before deploying.
6. Create products in Settings, then a product key in SDK & documentation. The raw key is returned once; only its SHA-256 hash is stored. Install the SDK locally with the instructions in `packages/sdk/README.md`. It has **not** been published to npm.
7. Wrap a supported provider client and call it inside `withCustomer({customerId: 'cus_...', feature: 'Deep research'}, callback)`. Call `flush()` before returning from a serverless invocation. Open `/?mode=live` to see real usage joined to the Stripe subscription.
8. For more than one product, explicitly map Stripe subscriptions to a product using the mapping controls in Integrations. Unmapped subscriptions appear in All products; usage with no matching subscription stays visible as zero-revenue / Unmapped, never disappears.

## Money semantics

- All amounts are USD. Revenue is the current **flat monthly subscription amount**, before taxes. It is not cash collected, recognized revenue, invoice profit, or net revenue after payment fees.
- This first live Stripe adapter supports undiscounted, licensed, per-unit USD monthly subscriptions with a one-month interval. Quantity is supported. Discounted, annual, mixed-interval, tiered, metered, and non-USD subscriptions are marked unsupported and reported by sync rather than silently normalized. Multiple subscriptions per customer require matching billing-period boundaries.
- Current AI contribution is period subscription revenue minus actual **estimated usage to date**. The percentage is undefined when revenue is zero. A current margin must not be read as a completed-month margin.
- The chart spreads subscription revenue across each billing period for a daily equivalent; it is not an invoice-payment chart. Costs come from daily aggregates, corrected using raw timestamps at Stripe billing-period edges.
- Forecast = current spend + recent daily average × remaining days. It uses the last seven available calendar days, including today; partial days and a changing usage pattern reduce forecast accuracy. Prior-period cost is exposed for growth sorting, not blended into the forecast. Forecasts are deterministic estimates.
- Feature runs count tracked provider requests. A workflow that calls an LLM five times is five executions in this beta. No feature revenue attribution is invented.
- Pricing simulation applies the selected allowance multiplier to the chosen feature’s cost only, then combines unchanged costs for other features. It assumes proportional usage, no churn, no demand response, and unchanged customer count.
- Token costs use the versioned catalog in `lib/costs.ts`. Rates were checked against [OpenAI's GPT-4.1 pricing](https://openai.com/index/gpt-4-1/), [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4o-mini), and [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing). Review rates before activating another model or pricing mode.
- OpenAI cached inputs are subtracted from total input; Anthropic cache reads and 5-minute/1-hour writes are additional categories. Unknown models/provider mismatches are rejected. Batch/priority/region discounts and surcharges, hosted tools, images, audio, negotiated rates, and taxes are not calculated by this catalog.

## Data integrity and retention

`POST /api/v1/events` takes a Bearer product key and `{events:[...]}`; max 100 events and 256 KiB. Schemas reject prompt/response fields and validate UUIDs, token counts, and timestamp bounds. Model prices are calculated on the server. Events are deduplicated by product + UUID, and raw rows, daily rollups, and monthly metering commit in one transaction. Organization locking makes event/product limits atomic across concurrent requests.

Raw events have tier-based 30/60/90-day retention. Data needed to correct the current active billing-period boundary is retained until that period closes. Separate 100-day receipts preserve idempotency even after raw pruning. Aggregates have no automatic expiry. Monthly event allowances count newly accepted events by their **ingestion month**, including backfill. Overage events receive 429; recurring overage billing is not implemented.

RLS protects all organization data. Browser roles receive no write grants. Privileged RPCs are executable only by the service role, except the boundary query, which validates organization ownership. Service credentials never enter client bundles. API keys and integration secrets must not be copied into frontend apps.

## Alerts and lifetime checkout

- Settings persists the target margin and email preference; Slack webhooks are restricted to Tier 3 and the exact Slack webhook host.
- Configure `RESEND_API_KEY`, a verified `ALERT_FROM_EMAIL`, and `CRON_SECRET`. An external scheduler can call `POST /api/jobs/daily` with `Authorization: Bearer <CRON_SECRET>`. This is **not scheduled automatically**. It prunes expired raw events and sends current signals only for opted-in workspaces. Delivery claims prevent concurrent duplicates; expired unsent claims can retry after 15 minutes. Email uses provider idempotency. Slack cannot guarantee exactly-once delivery after a crash.
- No emails or Slack messages were sent during development.
- Configure three one-time Stripe Prices ($49 / $59 / $69) and `STRIPE_LTD_TIER_{1,2,3}_PRICE_ID`. `/api/billing/checkout` creates a hosted checkout for the authenticated organization. The separate platform `/api/billing/webhook` accepts signed successful payment events, re-fetches the session and verifies its price before granting a tier, with idempotent purchase recording and no tier downgrade.
- New private-beta workspaces currently receive Tier 3 by default. Before a paid launch, replace this with an explicit trial/purchase entitlement lifecycle. Feature-level access is intentionally available throughout this beta; event/product/provider limits and Slack tier checks are enforced. Refund/revocation handling and recurring overages remain launch work. Do not market tier feature restrictions until those gates exist.

## API map

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Service/configuration status, no secrets |
| `GET /api/dashboard?product=all` | Organization-scoped live economics |
| `POST /api/products` | Create a product within the tier cap |
| `GET/POST/DELETE /api/keys` | List, create, or revoke a hashed product key |
| `POST /api/v1/events` | Authenticate, price, meter, aggregate usage |
| `POST /api/settings` | Save workspace and notification preferences |
| `GET/POST /api/subscriptions/map` | Inspect / map subscriptions to a product |
| `GET /api/stripe/connect` | Begin read-only Stripe OAuth |
| `GET /api/stripe/callback` | Verify state and exchange authorization code |
| `POST /api/stripe/sync` | Refresh current subscriptions |
| `POST /api/stripe/webhook` | Signed connected-account subscription updates |
| `POST /api/billing/checkout` | Create a lifetime checkout |
| `POST /api/billing/webhook` | Verify paid lifetime purchases |
| `POST /api/jobs/daily` | Protected pruning and notification delivery |

## Before admitting paying customers

Run the complete acceptance loop on real **test** accounts: sign up → connect Stripe → issue/revoke a product key → send known OpenAI and Anthropic usage → verify a customer's cost and recommendation → verify webhooks, receipt retries, and both notification channels. Database/money/SDK tests run locally, but real Supabase Auth, Stripe Connect, provider calls, Resend, Slack and deployed TLS have not been exercised without credentials.

Remaining product work includes streaming SDK support, durable SDK retry storage, broader billing/pricing modes, historical comparison UX, a paid trial/feature entitlement lifecycle, refunds and recurring overages, provider-rate maintenance, and deployment-specific operational monitoring. The SDK intentionally uses explicit wrapping and scoped identity instead of global client monkey-patching.
