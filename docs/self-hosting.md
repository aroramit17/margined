# Self-hosting

Margined runs on a Supabase project (Postgres + Auth + Edge Functions), a FastAPI backend, and a static React frontend. Everything is MIT-licensed.

## 1. Supabase

```bash
supabase start                # or create a hosted project
supabase db push              # applies migrations 001–004; see coordinated rollout below
supabase functions deploy hourly-rollup
supabase functions deploy daily-alerts
```

Schedule the functions (Supabase dashboard → Edge Functions → cron):

- `hourly-rollup`: `0 * * * *` — recomputes the current + previous UTC day from raw events into `daily_rollups`. Idempotent; re-running never double-counts.
- `daily-alerts`: `0 9 * * *` — evaluates alert configs and delivers email (Resend) / Slack.

Edge function secrets: `CRON_SECRET` (required, random, at least 32 characters) and `RESEND_API_KEY` (email alerts only). Every scheduled invocation must use POST with `Authorization: Bearer <CRON_SECRET>`. Keep this secret server-side and separate from user JWTs and Supabase keys. Both functions fail closed if it is missing. Gateway JWT verification stays disabled because the shared handler verifies this dedicated scheduler secret. See [Supabase function authorization](https://supabase.com/docs/guides/functions/auth).

### Coordinated rollout of migration 004

1. Upgrade the SDK used by each test integration: transient 408/429/5xx responses now retry; older SDKs discard 429. New events require stable IDs (current SDKs already supply them).
2. Pause all old ingestion workers and jobs. Apply the existing migrations plus `004_atomic_ingestion.sql`; do not apply the earlier standalone prototype schema.
3. Deploy the updated API and both protected Edge Functions, with `CRON_SECRET` configured in the functions and scheduler. Start the API, check first-event ingestion and retry counts, then re-enable scheduled jobs.
4. Verify against a test project that duplicate retries count once, account usage matches `/billing/status`, old keys fail after rotation, and unauthenticated job calls return 401. Do not roll back only the API: the old increment function is deliberately revoked.

Migration 004 preserves projects, events and the existing recorded monthly counters, including any historical overcounting inherited from older releases. It adds separate account counters and receipts for existing event IDs. Take a backup and reconcile historical usage before charging for overages. Receipts currently have no automatic expiry; do not prune them independently of an explicit replay/retention policy.

## 2. Backend (FastAPI)

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Environment:

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | ✅ | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-side DB access (ingest, rollup reads) |
| `SUPABASE_ANON_KEY` | ✅ | JWT validation for dashboard endpoints |
| `STRIPE_SECRET_KEY` | — | MRR sync |
| `STRIPE_WEBHOOK_SECRET` | — | Webhook signature verification |
| `STRIPE_CLIENT_ID` | — | Stripe Connect OAuth |
| `RESEND_API_KEY` | — | Email alerts |
| `CORS_ORIGINS` | — | Comma-separated allowed origins |

A `Dockerfile` is included. PostgreSQL serializes ingestion per account across API workers. Authenticated ingestion is limited to 120 batches per UTC minute per account; ingress infrastructure should additionally limit unauthenticated traffic. API keys are checked against current database state rather than a process cache.

## 3. Frontend

```bash
cd frontend
cp .env.example .env    # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm install && npm run build
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages). Point `VITE_API_URL` at your backend.

## 4. Point the SDK at your instance

```bash
export MARGINED_ENDPOINT=https://api.your-domain.com/ingest
```

## Data & failure semantics (worth knowing)

- The SDK never blocks or raises into the host app; if your backend is down, events buffer client-side (bounded at 10k) and are dropped after retries.
- The endpoint returns 202 only after the database transaction commits, with `accepted` and `duplicates` counts. Invalid input rejects the entire batch (400/413/422); invalid keys return 401; account rate/volume limits return 429; storage failures return 503. Retryable responses carry `Retry-After`.
- Batches contain 1–100 events and at most 1 MB. Each event requires a stable 1–64 character ID and a timezone-aware timestamp within the last 100 days or at most five minutes ahead. Unknown server models return 422; a client estimate is not trusted.
- Monthly volume is counted across all products owned by the account, in the UTC **ingestion** month. The existing free/starter/growth allowances remain 100K/1M/unlimited pending the separate LTD change. Quota rejection writes no new events; duplicate-only retries still succeed at quota. Quota retry delays are capped at 60 seconds so an upgrade can take effect promptly.
- SDK retries are bounded and in memory. Retry-After defers work without blocking flush; it does not guarantee delivery after process exit or a prolonged outage. Permanent rejections emit a diagnostic without customer payloads.
- Cost is recomputed server-side from raw token counts (`backend/app/pricing.py`); keep that table in sync with the SDK when you bump prices.
- Dashboards read from `daily_rollups`, not raw events, so query cost stays flat as event volume grows.


## Reproduce the hardening checks

```sh
uv pip install --python .venv/bin/python -r backend/requirements-dev.txt -e './sdk[dev]'
.venv/bin/python -m pytest backend/tests/test_api.py sdk/tests -q
.venv/bin/python scripts/test_database.py
(cd sdk-node && npm ci && npm test && npm run typecheck && npm run build)
deno task --config supabase/functions/deno.json test
deno task --config supabase/functions/deno.json check
```

The database runner needs local PostgreSQL binaries (`PG_BIN` can specify their directory). It creates a temporary Unix-socket-only cluster, applies the actual migrations and removes it after testing. It never uses Supabase credentials or a hosted database. The hosted gateway, Edge runtime and Stripe integration still need separate checks.
