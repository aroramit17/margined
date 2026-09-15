# First hardening pass — 2026-09-14

Implemented in the Margined fork, retaining its FastAPI API, SDK transports, Supabase tables and scheduled functions. This addresses ingestion deduplication, transactional metering, account-wide event limits, current API-key validation and scheduler authorization from the audit. No hosted migration or deployment has been performed.

## What changed

- Migration `004_atomic_ingestion.sql` fixes the partial-index conflict mismatch while preserving existing IDs and nullable historical event IDs. New events require stable IDs.
- The new service-only `ingest_event_batch` RPC authenticates the current project key and locks the owning billing account. It commits raw events, durable deduplication receipts and both account/project monthly counters together. A failure rolls all of these back. Receipts survive raw-event pruning.
- Limits now apply across the account's products and across backend workers. The database also applies a shared 120-batch-per-minute account rate limit. Existing free/starter/growth allowances are preserved at 100K/1M/unlimited; introducing the product's LTD tiers is a separate change.
- Mixed duplicate/new batches count only new events; duplicate-only retries work even at the monthly quota. A batch that would exceed the allowance inserts no new events. Usage follows the UTC ingestion month, and billing status reads the same account counter used for enforcement.
- The legacy `increment_usage` function is no longer executable by public, anonymous, authenticated or service roles. New privileged RPCs are service-only with fixed search paths. Browser roles cannot directly mutate project ownership or keys. Keys are looked up in the transaction, so rotation takes effect without a stale cache.
- The API returns 202 only on committed storage, with accepted/duplicate counts. Invalid input rejects the whole batch with 400/413/422, bad keys return 401, rate/volume limits return 429 and storage failures return 503. Errors avoid echoing private payloads or database details. Input is bounded while streaming the request body.
- Unknown server-priced models now fail explicitly instead of trusting a client estimate. Events require timezone-aware timestamps within 100 days in the past and five minutes in the future. The cost column was widened to avoid its former sub-$100 numeric ceiling.
- Both SDK transports retry 408/429/5xx responses and honor Retry-After without making flush sleep until a long quota reset. Permanent rejections produce a diagnostic. Python flushes are serialized to avoid overlapping manual/background drains. Queues and retries remain bounded and in memory.
- Both scheduled functions use a shared authorization wrapper before job work. A random `CRON_SECRET` of at least 32 characters is required; only authorized POST requests reach the handler. Missing configuration fails closed. Deno tests/typechecking now have a local configuration and dependency lockfile.

## Verification

**124 tests passed** across the relevant suites:

| Check | Result |
|---|---|
| Backend and Python SDK tests | 86 passed |
| Real PostgreSQL integration tests | 13 passed |
| Node SDK and transport tests | 22 passed |
| Scheduler authorization tests | 3 passed |
| Node SDK typecheck and build | Passed |
| Both Edge Function entrypoints, Deno typecheck | Passed |
| Three-way price-table consistency check | Passed; 43 models, version 2026-07-27 |
| Git whitespace/error check | Passed |

Integration checks use PostgreSQL 16.15 in a temporary Unix-socket-only cluster. They exercise the actual four migrations, role permissions, owner RLS, rollback after a database failure, same-ID concurrent retries, mixed duplicate/new batches, concurrent workers across products, account quotas, key rotation, rate-window reset, month separation, plan updates and preservation of existing data during migration. An HTTP test exercises FastAPI validation and server pricing against the real PostgreSQL transaction through a local database adapter.

The SDK tests cover deferred 429/503 retries with unchanged event IDs, permanent rejection, ordinary backoff and nonblocking cooldown during shutdown. Scheduler tests prove unauthorized requests never enter the wrapped job handler and both entrypoints retain the wrapper.

See [self-hosting](self-hosting.md#reproduce-the-hardening-checks) for exact commands. The local PostgreSQL package was installed for these checks; the temporary test server is stopped and its data directory removed after each run. No persistent database service was enabled.

## Deployment and remaining scope

Follow the [coordinated rollout](self-hosting.md#coordinated-rollout-of-migration-004). Pause old ingestion workers before migrating, deploy the new API with migration 004, configure `CRON_SECRET` in jobs and scheduler, and update SDK integrations that previously discarded 429. Rollback must be coordinated; the old counter RPC is intentionally disabled.

No credentials, provider calls, Stripe payments, email/Slack notifications or hosted Supabase writes were used in verification. These tests do not cover the deployed Supabase gateway or remote Edge runtime.

The original audit remains a historical snapshot. This pass does **not** claim to resolve its other findings: Stripe Connect callback/account scoping, hash-only key storage, complete provider/price-mode validation, reliable rollup backfill and concurrency handling, alert delivery claims/destination hardening, LTD purchase/product/feature limits, retention jobs and dependency advisory remediation remain planned work. Account volume enforcement uses the existing owner's billing account; an explicit organization model is still to be added.

Historical metering may already contain overcounts; the migration preserves those recorded values rather than inventing an ingestion month from event timestamps. Reconcile before overage billing. Receipts currently have no expiry. Bounded SDK retries can still lose data during long outages or process exit, including when Retry-After prevents an exit flush.

The preserved standalone prototype's TypeScript configuration now excludes the independent `margined/` checkout, keeping the two build contexts separate. No prototype business logic was ported in this pass.
