"""Actual PostgreSQL migrations, roles, transactions and concurrent API requests."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

SOCKET = os.environ.get("MARGINED_TEST_PG_SOCKET")
pytestmark = pytest.mark.skipif(not SOCKET, reason="Run scripts/test_database.py for a disposable PostgreSQL cluster")


def connect():
    import psycopg
    assert SOCKET and Path(SOCKET).name.startswith("mgd-pg-")
    return psycopg.connect(host=SOCKET, port=54329, user="postgres", dbname="postgres", autocommit=True)


def event(eid="event-1", **extra):
    return {"event_id": eid, "customer_id": "customer", "feature": "chat", "run_id": None,
            "model": "gpt-4.1", "provider": "openai", "input_tokens": 100, "output_tokens": 50,
            "cache_read_tokens": 0, "cache_write_tokens": 0, "cost_usd": "0.0006", "metadata": {},
            "occurred_at": datetime.now(timezone.utc).isoformat(), **extra}


def ingest(key, events):
    from psycopg.types.json import Jsonb
    with connect() as conn:
        conn.execute("SET ROLE service_role")
        return conn.execute("SELECT public.ingest_event_batch(%s,%s)", (key, Jsonb(events))).fetchone()[0]


@pytest.fixture
def db(request):
    with connect() as conn:
        for role in ("anon", "authenticated", "service_role"):
            if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (role,)).fetchone():
                conn.execute(f"CREATE ROLE {role}" + (" BYPASSRLS" if role == "service_role" else ""))
        conn.execute("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; CREATE SCHEMA public; CREATE SCHEMA auth")
        conn.execute("GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role")
        conn.execute("CREATE TABLE auth.users(id uuid PRIMARY KEY)")
        conn.execute("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$")
        conn.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role")
        migrations = Path(__file__).resolve().parents[3] / "supabase/migrations"
        users = [uuid4(), uuid4()]
        projects = [uuid4(), uuid4(), uuid4()]
        for path in sorted(migrations.glob("*.sql")):
            if path.name == "004_atomic_ingestion.sql" and getattr(request, "param", None) == "legacy":
                conn.execute("INSERT INTO auth.users VALUES (%s)", (users[0],))
                for pid, key, count in zip(projects[:2], ["key-a", "key-b"], [7,9]):
                    conn.execute("INSERT INTO projects(id,user_id,name,api_key) VALUES (%s,%s,'legacy',%s)", (pid, users[0], key))
                    conn.execute("INSERT INTO usage_counters VALUES (%s,to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),%s)", (pid,count))
                conn.execute("INSERT INTO llm_events(project_id,event_id,customer_id,feature,model,provider,input_tokens,output_tokens,cost_usd,occurred_at) VALUES (%s,'legacy-event','customer','chat','gpt-4.1','openai',100,50,.0006,now())", (projects[0],))
            conn.execute(path.read_text())
        for uid in users:
            conn.execute("INSERT INTO public.app_users(id) VALUES (%s) ON CONFLICT DO NOTHING", (uid,))
        for pid, uid, key in zip(projects, [users[0], users[0], users[1]], ["key-a", "key-b", "key-c"]):
            conn.execute("INSERT INTO projects(id,user_id,name,api_key) VALUES (%s,%s,'test',%s) ON CONFLICT DO NOTHING", (pid, uid, key))
        yield SimpleNamespace(conn=conn, users=users, projects=projects)


def used(db):
    return db.conn.execute("SELECT coalesce(sum(events),0) FROM account_usage_counters WHERE user_id=%s", (db.users[0],)).fetchone()[0]


def near_limit(db, n=99999):
    db.conn.execute("INSERT INTO account_usage_counters(user_id,month,events) VALUES (%s,to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),%s)", (db.users[0], n))


def test_duplicate_and_mixed_batches_survive_raw_pruning(db):
    assert ingest("key-a", [event()])["accepted"] == 1
    result = ingest("key-a", [event(), event("new"), event("new")])
    assert (result["accepted"], result["duplicates"], used(db)) == (1, 2, 2)
    db.conn.execute("DELETE FROM llm_events")
    assert ingest("key-a", [event()])["duplicates"] == 1
    assert used(db) == 2
    assert db.conn.execute("SELECT count(*) FROM llm_events").fetchone()[0] == 0


def test_failure_rolls_back_receipts_events_and_counters(db):
    import psycopg
    with pytest.raises(psycopg.errors.NotNullViolation):
        ingest("key-a", [event("good"), event("bad", customer_id=None)])
    for table in ("event_receipts", "llm_events", "account_usage_counters", "usage_counters"):
        assert db.conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0
    assert ingest("key-a", [event("good")])["accepted"] == 1


def test_allowance_is_shared_and_rejection_is_atomic(db):
    near_limit(db)
    result = ingest("key-a", [event("one"), event("two")])
    assert result["status"] == "quota_exceeded" and result["accepted"] == 0
    assert db.conn.execute("SELECT count(*) FROM event_receipts").fetchone()[0] == 0
    assert ingest("key-b", [event("last")])["accepted"] == 1
    assert ingest("key-a", [event()])["status"] == "quota_exceeded"
    assert ingest("key-b", [event("last")])["duplicates"] == 1
    assert ingest("key-c", [event()])["accepted"] == 1
    assert used(db) == 100000


def test_concurrent_workers_cannot_overshoot_across_products(db):
    near_limit(db, 99998)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda i: ingest("key-a" if i % 2 else "key-b", [event(str(i))]), range(12)))
    assert sum(r.get("accepted", 0) for r in results) == 2
    assert used(db) == 100000
    assert db.conn.execute("SELECT count(*) FROM llm_events").fetchone()[0] == 2


def test_concurrent_duplicate_retries_count_once(db):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: ingest("key-a", [event()]), range(12)))
    assert sum(r["accepted"] for r in results) == 1
    assert sum(r["duplicates"] for r in results) == 11
    assert used(db) == 1


def test_month_rollover_and_plan_upgrade_use_database_state(db):
    db.conn.execute("INSERT INTO account_usage_counters VALUES (%s,'2000-01',100000)", (db.users[0],))
    assert ingest("key-a", [event()])["events_used"] == 1
    db.conn.execute("UPDATE account_usage_counters SET events=100000 WHERE month <> '2000-01'")
    assert ingest("key-a", [event("blocked")])["status"] == "quota_exceeded"
    db.conn.execute("UPDATE billing_accounts SET plan='starter' WHERE user_id=%s", (db.users[0],))
    assert ingest("key-b", [event("upgrade")])["events_limit"] == 1000000
    db.conn.execute("UPDATE billing_accounts SET plan='growth' WHERE user_id=%s", (db.users[0],))
    assert ingest("key-a", [event("growth")])["events_limit"] is None


def test_key_rotation_and_untrusted_project_field(db):
    assert ingest("no-key", [event()])["status"] == "invalid_key"
    ingest("key-a", [event(project_id=str(db.projects[2]))])
    assert db.conn.execute("SELECT project_id FROM llm_events").fetchone()[0] == db.projects[0]
    db.conn.execute("UPDATE projects SET api_key='rotated' WHERE id=%s", (db.projects[0],))
    assert ingest("key-a", [event("old")])["status"] == "invalid_key"
    assert ingest("rotated", [event("new")])["accepted"] == 1


def test_shared_rate_limit_and_window_reset(db):
    ingest("key-a", [event()])
    db.conn.execute("UPDATE ingest_rate_windows SET requests=120")
    assert ingest("key-b", [event("rate")])["status"] == "rate_limited"
    assert used(db) == 1
    db.conn.execute("UPDATE ingest_rate_windows SET window_start=now()-interval '2 minutes'")
    assert ingest("key-b", [event("rate")])["accepted"] == 1


def test_browser_roles_cannot_execute_privileged_rpcs_or_change_projects(db):
    import psycopg
    for role in ("anon", "authenticated"):
        with connect() as conn:
            conn.execute(f"SET ROLE {role}")
            for sql in (
                "SELECT increment_usage('00000000-0000-0000-0000-000000000000','2026-09',-999)",
                "SELECT ingest_event_batch('key-a','[]'::jsonb)",
                "SELECT account_usage_status('00000000-0000-0000-0000-000000000000')",
                "UPDATE projects SET api_key='stolen'",
                "INSERT INTO projects(user_id,name,api_key) SELECT user_id,'bad','bad' FROM projects LIMIT 1",
            ):
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    conn.execute(sql)
    with connect() as conn:
        conn.execute("SET ROLE service_role")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            conn.execute("SELECT increment_usage(%s,'2026-09',-999)", (db.projects[0],))


def test_legacy_browser_tokens_cannot_read_application_data(db):
    import psycopg
    ingest("key-a", [event()]); ingest("key-c", [event()])
    for role in ("anon", "authenticated"):
        with connect() as conn:
            conn.execute(f"SET ROLE {role}")
            conn.execute("SELECT set_config('request.jwt.claim.sub',%s,false)", (str(db.users[0]),))
            for table in ("projects", "llm_events", "account_usage_counters", "app_users"):
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    conn.execute(f"SELECT * FROM {table}")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute("SELECT resolve_clerk_user('user_attacker')")


def test_clerk_identity_is_stable_concurrent_and_isolated(db):
    def resolve(subject):
        with connect() as conn:
            conn.execute("SET ROLE service_role")
            return conn.execute("SELECT resolve_clerk_user(%s)", (subject,)).fetchone()[0]
    with ThreadPoolExecutor(max_workers=8) as pool:
        identities = list(pool.map(lambda _: resolve('user_alpha'), range(12)))
    assert len({item['id'] for item in identities}) == 1
    other = resolve('user_beta')
    assert other['id'] != identities[0]['id']
    assert db.conn.execute("SELECT count(*) FROM app_users WHERE clerk_user_id='user_alpha'").fetchone()[0] == 1
    uid = identities[0]['id']
    db.conn.execute("INSERT INTO projects(user_id,name,api_key) VALUES (%s,'clerk','clerk-key')", (uid,))
    assert ingest('clerk-key',[event()])['accepted'] == 1
    status = db.conn.execute("SELECT account_usage_status(%s)", (uid,)).fetchone()[0]
    assert status['events_used'] == 1
    assert db.conn.execute("SELECT count(*) FROM auth.users WHERE id=%s", (uid,)).fetchone()[0] == 0


def test_http_to_real_postgres_transaction(db, monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.routes import ingest as module
    monkeypatch.setattr(module, "_store_batch", ingest)
    client = TestClient(app)
    body = {"events": [event(cost_usd=999)]}
    response = client.post('/ingest', json=body, headers={"Authorization": "Bearer key-a"})
    assert response.status_code == 202
    assert response.json()["accepted"] == 1
    assert float(db.conn.execute("SELECT cost_usd FROM llm_events").fetchone()[0]) == pytest.approx(0.0006)
    assert client.post('/ingest', json=body, headers={"Authorization": "Bearer key-a"}).json()["duplicates"] == 1
    db.conn.execute("UPDATE account_usage_counters SET events=100000")
    response = client.post('/ingest', json={"events":[event('more')]}, headers={"Authorization":"Bearer key-a"})
    assert response.status_code == 429 and int(response.headers['retry-after']) > 0


@pytest.mark.parametrize("db", ["legacy"], indirect=True)
def test_upgrade_preserves_ids_dedup_and_recorded_account_usage(db):
    assert used(db) == 16
    assert db.conn.execute("SELECT project_id,event_id FROM event_receipts").fetchall() == [(db.projects[0], "legacy-event")]
    assert ingest("key-a", [event("legacy-event")])["duplicates"] == 1
    assert used(db) == 16
    result = ingest("key-b", [event("post-upgrade")])
    assert result["accepted"] == 1 and result["events_used"] == 17
    assert db.conn.execute("SELECT id FROM projects WHERE api_key='key-a'").fetchone()[0] == db.projects[0]


def test_sql_conflict_target_now_matches_the_unique_index(db):
    ingest("key-a", [event()])
    result = db.conn.execute("""INSERT INTO llm_events(project_id,event_id,customer_id,feature,model,provider,input_tokens,output_tokens,cost_usd,occurred_at)
        SELECT project_id,event_id,customer_id,feature,model,provider,input_tokens,output_tokens,cost_usd,occurred_at FROM llm_events
        ON CONFLICT(project_id,event_id) DO NOTHING""")
    assert result.rowcount == 0
