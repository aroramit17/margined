# Margined

> Know which AI features are profitable. Know which customers are costing you money.

LLM unit economics for AI SaaS founders. Add one argument to your LLM calls. Get a dashboard showing LLM cost per customer, feature profitability, and gross margin per customer.

## Architecture

```
margined/
├── sdk/          Python SDK (pip install margined)
├── backend/      FastAPI backend (Railway)
├── frontend/     React + Tailwind + shadcn/ui (Vercel)
└── supabase/     Schema migrations + Edge Functions
```

## Quick Start

### 1. Supabase

```bash
supabase start
supabase db push
supabase functions deploy hourly-rollup
supabase functions deploy daily-alerts
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

### 4. SDK (local development)

```bash
cd sdk
pip install -e ".[dev]"
python -m pytest tests/
```

## SDK Usage

```python
pip install margined
```

```python
import margined
margined.init(api_key="mgd_...")  # or MARGINED_API_KEY env var

response = margined.track(
    client.messages.create(...),
    user_id=current_user.id,
    feature="summarize_document",
)
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI + Python |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Frontend | React + Vite + Tailwind |
| Hosting | Vercel (frontend) + Railway (backend) |
| Email | Resend |
| Billing | Stripe |
| Edge jobs | Supabase Edge Functions |

## Pricing

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 100K calls/month, 1 project |
| Starter | $49/month | 1M calls, 3 projects, Stripe + margin column |
| Growth | $149/month | Unlimited, 5 seats, pricing calculator |
