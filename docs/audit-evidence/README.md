# Audit evidence — 2026-09-14

Revision: `ceaa06ea9813b1a4f20b086a36abf63de8e58fae`. See [the audit](../MVP_REUSE_AUDIT.md) for scope and interpretation.

## Baseline commands and results

Executed in the Margined checkout unless a subdirectory is shown:

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt -e './sdk[dev]'
.venv/bin/python -m pytest sdk/tests backend/tests -q
# 75 passed, 2 warnings in 1.93s (44 SDK + 31 backend)
.venv/bin/python scripts/check_prices.py
# Price tables in sync: 43 models, version 2026-07-27

# sdk-node/
npm ci --ignore-scripts --no-audit --no-fund
npm test
# 17 passed
npm run typecheck
npm run build
# both pass

# frontend/
npm ci --ignore-scripts --no-audit --no-fund
npm run build
# pass; initial JS 939.41 kB, gzip 265.41 kB; chunk/demo import warnings
```

`python-environment.txt` records the resolved Python audit environment. The Node installs used the unchanged committed lockfiles. `npm-frontend.json` and `npm-sdk-node.json` are raw npm audit reports, not automatic remediation instructions. Audit commands exited 1 due to advisory findings.

## SQL reproduction

Run in a disposable database only. The audit used the previous prototype's already-installed `@electric-sql/pglite` package as a local PostgreSQL engine; no application code was imported from that prototype.

Bootstrap roles `anon`, `authenticated`, `service_role BYPASSRLS`, `auth.users(id uuid PRIMARY KEY)` and a synthetic `auth.uid()` returning null. Apply the fork's three migrations in order. As the database owner:

```sql
INSERT INTO auth.users VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO projects(id,user_id,name,api_key) VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111','audit','synthetic-key'
);

INSERT INTO llm_events (
  project_id,event_id,customer_id,feature,model,provider,
  input_tokens,output_tokens,cost_usd,occurred_at
) VALUES (
  '22222222-2222-2222-2222-222222222222','audit-event',
  'c','f','m','p',1,1,0.1,now()
) ON CONFLICT(project_id,event_id) DO NOTHING;
-- 42P10: there is no unique or exclusion constraint matching
-- the ON CONFLICT specification

SELECT
  has_function_privilege('anon','increment_usage(uuid,text,bigint)','EXECUTE'),
  has_function_privilege('authenticated','increment_usage(uuid,text,bigint)','EXECUTE');
-- true, true

SET ROLE anon;
SELECT increment_usage(
  '22222222-2222-2222-2222-222222222222','2026-09',-999
);
-- -999
RESET ROLE;
```

The engine was closed after these synthetic checks. This reproduces SQL behavior, not a deployed Supabase gateway exploit. Docker/Podman were absent, so the complete local Supabase stack was not run.

## Other targeted observations

- Enumerated FastAPI `app.routes`: Stripe connect URL, mapping, refresh, customer list and webhook routes exist; no Stripe callback route exists.
- Called `_mrr_from_subscription` with one quantity-1 EUR monthly price of 4,900 minor units: result `(49.0, 'Pro')`, with no currency rejection.
- Patched ingestion project lookup to a synthetic project and forced both `upsert.execute` and `insert.execute` to raise: TestClient returned HTTP 202.
- Called compiled Node `usageFromObject` with `{input_tokens:1000, output_tokens:50, input_tokens_details:{cached_tokens:900}}`: returned input 1000, output 50, cache read 0, cache write 0.
- Wrapped a fake client's `create()` that returned a Promise with `.withResponse()`: original helper type `function`, wrapped helper type `undefined`.
- Constructed the Supabase client with a synthetic JWT and localhost URL: passed without an HTTP request. This checks basic dependency instantiation only.

No secrets, real customer data, remote database writes, emails, Slack messages, provider calls or Stripe payments were involved in these checks.
