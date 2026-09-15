# Live setup progress — 2026-09-14

## Current direction — Margined-first

The [first Margined ingestion hardening pass](../margined/docs/INGESTION_HARDENING.md) is implemented and verified locally, including a fourth migration and protected scheduler endpoints. It has not been deployed or applied to the hosted project. Complete Stripe Connect next, then follow the fork's coordinated setup instructions.

The user reports creating a Supabase project. Its hosted project reference and schema have not yet been verified. Keep that project; do not create another by default.

Live setup for the standalone scaffold is paused and superseded. Margined has been forked to https://github.com/aroramit17/margined and cloned into `margined/` under the workspace root. See the [reuse audit](../margined/docs/MVP_REUSE_AUDIT.md) and [new build spec](../margined/docs/MVP_BUILD_SPEC.md). Resume using the fork's reviewed migration chain plus its required fixes, not the standalone `supabase/migrations/001_initial.sql`.

The audit found that Margined's Stripe Connect callback/account scoping and data-integrity/security fixes must precede live integration. No hosted schema has been applied by this task. The completed setup work below is historical and preserved for reference.

## Completed

- Created `.env.local` from the example without overwriting existing configuration. File permissions are `0600` and Git ignores it. Secrets are still blank.
- Installed project-local Supabase CLI 2.117.0 and initialized `supabase/config.toml`.
- Configured project name `inferlytic-beta`, local site URL `http://127.0.0.1:3000`, and exact callback `http://127.0.0.1:3000/auth/callback`. Email confirmations are enabled and the minimum password length is 8. These settings have **not yet been applied to a hosted project**.
- Installed the official Stripe CLI 1.50.11 via Homebrew.
- Built the Node SDK successfully.
- Verified the running app's health endpoint: demo available, live configuration absent.
- Signed into the existing Supabase account using its previously used GitHub login.
- Prepared the new-project form in Chrome: `inferlytic-beta`, organization `aroramit` (Free), Americas region, Data API enabled, automatic RLS enabled.
- Opened Stripe's test-dashboard sign-in page in the same Chrome setup group.

## Previous handoff — superseded

1. Finish the database password step and submit the prepared Supabase project form. Keep the password private. The browser credential-handling rule requires the user to enter a new password themselves.
2. Sign into the intended Stripe account in the other setup tab.

Since this handoff, the user has reported creating the project. Its identity and live connection still need verification. No schema has been applied remotely by this task; no product API key has been issued; no customer data or provider usage has been ingested.

## Previous resume steps — do not execute for the new architecture

- Inspect the existing setup tabs before creating anything, to avoid a duplicate project.
- Apply `supabase/migrations/001_initial.sql` to the new project before app signup. The CLI does not currently have a management access token; use the dashboard SQL editor or authorize CLI access explicitly.
- Save the project's URL, public key, and server key directly into `.env.local`, without logging secrets. Restart the app and verify the live configuration status.
- Apply the hosted email/site/callback settings. Configure Google only once the corresponding OAuth client is available.
- Have the owner complete app signup/password entry; verify that the trigger creates the organization and first product.
- Configure Stripe Connect in test mode and the OAuth callback, then authorize the read-only account connection.
- For localhost, use Stripe CLI forwarding for connected-account subscription events; a hosted Stripe webhook cannot directly call 127.0.0.1. Save the forwarding secret privately to `.env.local`.
- Create a product key, instrument a test app, verify ingestion and customer margins, and map subscriptions to products.
