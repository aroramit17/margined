# Clerk login migration

## Audit and plan

The beta has no customers to migrate. Supabase currently provides the React login form, session tokens for API requests, backend token validation, and UUID foreign keys into `auth.users`. The frontend does not use Supabase directly for application data; all data goes through the FastAPI backend. The demo is a separate synthetic data path.

Switch the beta to Clerk in one checkpoint:

1. Create a new Capybara development application in the owner's existing Clerk account, then pull local keys without committing them.
2. Replace the Supabase login/session integration with Clerk's React provider and prebuilt sign-in/sign-up components. Retain the existing branding, routes, and demo experience.
3. Verify Clerk session JWTs on the backend against the configured issuer's JWKS, RS256 signature, expiration, not-before time, and allowed frontend origin. Do not accept Supabase tokens after cutover.
4. Add `app_users`: keep internal UUID ownership, map verified Clerk subjects to those UUIDs, and retain old UUIDs as unlinked legacy records. Never join identities by email. Repoint existing foreign keys without changing project/event IDs or usage counters. Provision new Clerk identities atomically on the first authenticated API request.
5. Keep database access behind the backend; revoke legacy direct browser access to application tables. Preserve service-role SDK ingestion and account usage calculations.
6. Run auth, database migration/isolation, and frontend tests. Apply the additive migration to the beta database, verify the UI, then commit and push all source and documentation.

Existing Supabase sessions stop working after cutover. Existing data stays intact; any future migration of an actual legacy owner requires an explicit identity link. Password export/import and OAuth continuity are unnecessary for this empty beta. Supabase remains the database; Stripe remains the billing provider.

## Completed checkpoint

Created the Capybara Clerk development application, replaced the Supabase browser auth integration, and applied migration `005` to the beta database. Google sign-in completed through the real browser flow; the protected projects API returned HTTP 200 and provisioned one linked internal identity. Backend/auth, database integration, frontend auth and local setup tests passed (78 total), as did the production frontend build. Deployment to a public production domain remains a later step.
