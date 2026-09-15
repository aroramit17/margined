# Capybara local connections

The active application is the Margined fork in this directory. The older app at port 3000 is an archived prototype.

## Configured September 14, 2026

- Supabase project: **inferlytic-beta**, organization **pdf-rag**, reference `wonrumlzqohwjkvcolld`.
- Migrations `001`–`004` applied as one transaction through the Supabase SQL Editor and recorded in `supabase_migrations.schema_migrations`. Verified all ten public application tables have RLS enabled. Migration history also has RLS enabled and no anon/authenticated access.
- Supabase Auth Site URL: `http://127.0.0.1:5173`.
- Allowed email redirect: `http://127.0.0.1:5173/auth/callback`.
- Email/password and email-link login use the real project. Email confirmation remains enabled. PKCE links must open in the same browser and origin that requested them.
- Stripe: the existing **SecureWebPay** account, `acct_1EUIbUFWefDVPYNO`, **test mode**. The backend successfully authenticated to Stripe using its existing test key.
- Local credentials: `frontend/.env.local` and `backend/.env`, both mode `0600` and ignored by Git. The backend uses an existing legacy Supabase service-role key; the new secret-key reveal control did not return a usable key during setup. The retained database client requires the legacy service-role format. No keys were created or rotated.

## Run locally

Use Node 20.19+ or 22.12+ for the frontend toolchain. In separate terminals, from this checkout:

```sh
cd frontend
npm ci
npm run dev
```

```sh
cd backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:5173/login`. Use this exact host rather than `localhost` so the browser's PKCE verifier and email redirect share an origin. Vite forwards `/api` to the backend. The fixed port prevents a silently changed login callback.

An email confirmation does not enter protected onboarding until a session exists. The callback exchanges each code once, including under React StrictMode; expired or invalid links return to login with an error. Demo mode exits only after successful authentication.

## Set up another machine

Copy the example environment files and supply that machine's credentials locally. For entering existing keys without putting them in shell history, the optional helper serves a temporary form on loopback:

```sh
python3 scripts/local_setup.py --project-ref YOUR_PROJECT_REF --public-key YOUR_PUBLIC_KEY
```

Open its printed URL, submit the existing legacy Supabase service-role key and Stripe **test** key, then stop it with Ctrl-C. It uses an unguessable URL, validates Host and POST Origin, writes credentials atomically with owner-only permissions, and returns no credential values. It never accepts live Stripe keys. Its SQL bundle is only for a fresh, empty database: it does not execute SQL or support upgrading an existing project. For ongoing migrations, use the Supabase CLI.

## Scope still pending

This checkpoint connects local authentication, the database, and the Stripe test API. It does not deploy a public app or enable live payments.

- Complete an actual owner's email/password or email-link sign-in to verify the hosted mail delivery path. Supabase's default sender may require custom SMTP for addresses outside the organization.
- The upstream Stripe Connect handler still lacks a secure OAuth callback and account-scoped subscription sync. `STRIPE_CLIENT_ID` remains unset until that implementation is ready.
- Customer and billing webhook listeners are not configured yet. No automatic Stripe event sync is claimed.
- The upstream Starter/Growth recurring checkout does not match Capybara's LTD tiers. No checkout prices were configured or products created for those old plans. LTD checkout and entitlement enforcement remain a separate product change.
- Edge rollups, scheduled alerts, production hosting, and production auth redirect URLs remain pending.

## Verification

- Backend token validation calls the issuing Supabase project’s Auth API directly, supporting new publishable keys without upgrading the retained database client. Network outages return a retryable service error.
- Eleven backend auth tests pass; the combined backend suite passes 49 tests.
- Six frontend tests cover confirmation-required signup, email redirect URLs, rejected password login, one-time callback exchange under StrictMode, expired links, and provider errors.
- Two local setup tests cover preserving other environment settings, private file permissions, and migration transaction/history generation.
- Frontend TypeScript and production build pass. Existing bundle-size warnings remain.
- Hosted checks: database connection succeeds; migrations and RLS verified in SQL Editor; Supabase Auth settings return email enabled and confirmations required; Stripe account retrieval succeeds in test mode.
- The Vite/React test toolchain was updated for the authentication tests. `npm audit` still reports two inherited moderate React Router advisories requiring a major router upgrade; this app uses fixed internal navigation targets and no SSR hydration. That broader upgrade is not included here.
