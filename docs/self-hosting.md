# Self-hosting

Margined runs on a Supabase project (Postgres + Auth + Edge Functions), a FastAPI backend, and a static React frontend. Everything is MIT-licensed.

## 1. Supabase

```bash
supabase start                # or create a hosted project
supabase db push              # applies migrations/001..002 (RLS on every table)
supabase functions deploy hourly-rollup
supabase functions deploy daily-alerts
```

Schedule the functions (Supabase dashboard → Edge Functions → cron):

- `hourly-rollup`: `0 * * * *` — recomputes the current + previous UTC day from raw events into `daily_rollups`. Idempotent; re-running never double-counts.
- `daily-alerts`: `0 9 * * *` — evaluates alert configs and delivers email (Resend) / Slack.

Edge function secrets: `RESEND_API_KEY` (email alerts only).

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

A `Dockerfile` is included; the API is stateless and scales horizontally. Note: ingest rate limiting and the API-key cache are in-process — put a shared limiter (or Redis) in front if you run multiple replicas at serious volume.

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
- The ingest endpoint always returns 202 — invalid events are silently discarded rather than breaking callers.
- Cost is recomputed server-side from raw token counts (`backend/app/pricing.py`); keep that table in sync with the SDK when you bump prices.
- Dashboards read from `daily_rollups`, not raw events, so query cost stays flat as event volume grows.
