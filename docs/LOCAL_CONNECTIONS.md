# Capybara local connections

The active application is this Margined fork. The older app at port 3000 is an archived prototype. Public frontend deployment is documented in [CLOUDFLARE_DEPLOYMENT.md](CLOUDFLARE_DEPLOYMENT.md); the public build serves the landing page and demo, while this local setup retains real beta sign-in.

## Current setup

- **Clerk login:** Capybara development application `app_3JLjRALL0piAQbJaRqKFHKshC5y`, instance `ins_3JLjR5SvpXEzm3JRc4obDDPOOHr`, in the owner's existing Clerk account. [Open Clerk](https://dashboard.clerk.com/apps/app_3JLjRALL0piAQbJaRqKFHKshC5y/instances/ins_3JLjR5SvpXEzm3JRc4obDDPOOHr).
- **Issuer:** `https://enhanced-coyote-2985.clerk.accounts.dev`. The login UI offers Google and email sign-in. This supersedes the previous Supabase email-link setup.
- **Database:** Supabase **inferlytic-beta**, organization **pdf-rag**, reference `wonrumlzqohwjkvcolld`. Migrations `001`–`005` applied and recorded. Clerk subjects map to internal UUIDs in `app_users`; existing project and usage UUIDs are preserved. Legacy browser database access is revoked. All application tables have RLS enabled.
- **Stripe:** Existing **SecureWebPay** account `acct_1EUIbUFWefDVPYNO`, **test mode**. Its API connection was verified in the preceding setup checkpoint.
- **Local files:** `frontend/.env.local` contains only frontend configuration and the Clerk publishable key. `backend/.env` contains Supabase/Stripe secrets and Clerk issuer configuration. Both are mode `0600` and ignored by Git. The retained database client uses a legacy Supabase service-role key.

## Run locally

Use Node 20.19+ or 22.12+. From this checkout, use separate terminals:

```sh
cd frontend
npm ci
npm run dev
```

```sh
cd backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:5173/login`. Vite forwards `/api` to the backend. Keep this exact origin in `CLERK_AUTHORIZED_PARTIES`; adding another frontend host requires updating that allowlist. If dependency updates leave Vite's optimized imports stale, restart with `npm run dev -- --force`.

Clerk handles sign-in, sign-up, verification and sign-out. API requests obtain a fresh Clerk session token. The backend verifies RS256, the exact issuer, expiry/not-before/issued-at times, a session ID, a Clerk user subject, an allowed origin and non-pending status. It atomically provisions the internal identity on first authenticated access. User data is never joined by email. Changing signed-in users clears cached dashboard data. Supabase auth tokens no longer authenticate to the API.

## Another machine

Copy the example environment files and configure the same application and issuer. Clerk CLI can link the repository and pull development keys:

```sh
npx -y clerk@latest auth login
npx -y clerk@latest link --app app_3JLjRALL0piAQbJaRqKFHKshC5y
npx -y clerk@latest env pull --app app_3JLjRALL0piAQbJaRqKFHKshC5y --instance dev --file .env.local
```

Run the env pull inside `frontend`. The CLI also writes `CLERK_SECRET_KEY`: move that line to `backend/.env` if needed for administration, or remove it from the frontend file. Runtime JWT verification only needs the public issuer/JWKS. Never use a `VITE_` prefix for secret keys. Local CLI project links live in Clerk's local configuration, not Git. `clerk doctor` confirms the application is linked and reachable. Its missing frontend secret warning is expected: server secrets belong in the backend only.

The optional `scripts/local_setup.py` helper remains available for entering existing Supabase service-role and Stripe test keys without shell-history exposure. Stop its loopback server after use. Its generated SQL bundle is for a fresh database only; use individual migrations/CLI for upgrades.

## Validation and remaining setup

All 78 checks passed: 56 backend/auth tests, 14 PostgreSQL integration tests, 6 frontend auth tests and 2 local setup tests. These cover invalid signatures, issuer/origin mismatches, expired/future tokens, missing claims, pending sessions, rejected legacy browser access, concurrent identity provisioning, preserved usage, per-request tokens and cache isolation. The TypeScript production build passes.

The first owner signed in successfully with the chosen Google account. The dashboard displays the signed-in email and an empty project list. Authenticated `GET /projects` requests returned HTTP 200, and Supabase contains one linked `app_users` record. The Google/email login UI is verified; the email verification path has not been exercised end to end. The application remains in Clerk development mode; production domains and keys need configuration at launch.

Still pending from the wider MVP: secure customer Stripe OAuth and account-scoped sync, automatic Stripe webhook handling, LTD checkout and entitlements, Edge rollup schedules, alerts, and public hosting for the authenticated backend. The old recurring Starter/Growth checkout prices are intentionally not configured because they differ from the LTD product.

Existing frontend bundle-size warnings and the two inherited moderate React Router advisories remain. This app uses fixed internal redirect targets and no SSR hydration; the broader router upgrade is separate.
