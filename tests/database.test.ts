import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
test("database migration, organization isolation, atomic limits, deduplication and rollups", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/001_initial.sql", import.meta.url),
        "utf8",
      ),
    );
    const u1 = randomUUID(),
      u2 = randomUUID();
    await db.query("insert into auth.users(id) values($1),($2)", [u1, u2]);
    const { rows: orgs } = await db.query<{ id: string; owner_id: string }>(
      "select id,owner_id from organizations order by created_at",
    );
    const org = orgs.find((o) => o.owner_id === u1)!;
    const { rows: products } = await db.query<{ id: string }>(
      "select id from products where organization_id=$1",
      [org.id],
    );
    const product = products[0].id,
      key = randomUUID();
    await db.query(
      "insert into api_keys(id,organization_id,product_id,key_hash,prefix) values($1,$2,$3,$4,$5)",
      [key, org.id, product, "hashed-key", "inf_live_test"],
    );
    const event = {
      id: randomUUID(),
      customerId: "cus_a",
      feature: "chat",
      provider: "openai",
      model: "gpt-4.1-mini",
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      cacheWrite1hTokens: 0,
      cost: 0.04,
      pricingVersion: "test",
      timestamp: new Date().toISOString(),
    };
    const ingest = async (events: any[]) =>
      db.query<{ n: number }>("select ingest_events($1,$2::jsonb) n", [
        key,
        JSON.stringify(events),
      ]);
    assert.equal((await ingest([event, event])).rows[0].n, 1);
    assert.equal((await ingest([event])).rows[0].n, 0);
    assert.equal(
      (
        await db.query<{ cost: string; runs: number }>(
          "select cost,runs from daily_usage",
        )
      ).rows[0].cost,
      "0.040000000",
    );
    assert.equal(
      Number(
        (await db.query<{ runs: number }>("select runs from daily_usage"))
          .rows[0].runs,
      ),
      1,
    );
    // Midday Stripe boundaries subtract only out-of-period raw events from daily totals.
    const boundary = new Date();
    boundary.setUTCDate(boundary.getUTCDate() - 1);
    boundary.setUTCHours(6, 0, 0, 0);
    const end = new Date(boundary.getTime() + 30 * 86400000);
    await db.query(
      "insert into subscriptions(id,organization_id,customer_id,customer_name,plan,revenue,currency,period_start,period_end,status,product_id) values('sub_edge',$1,'cus_edge','Boundary customer','Pro',99,'usd',$2,$3,'active',$4)",
      [org.id, boundary.toISOString(), end.toISOString(), product],
    );
    await ingest([
      {
        ...event,
        id: randomUUID(),
        customerId: "cus_edge",
        timestamp: new Date(boundary.getTime() - 3600000).toISOString(),
      },
      {
        ...event,
        id: randomUUID(),
        customerId: "cus_edge",
        timestamp: new Date(boundary.getTime() + 3600000).toISOString(),
      },
    ]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u1]);
    const corrections = await db.query<{ cost: string; runs: number }>(
      "select * from billing_boundary_adjustments($1,null)",
      [org.id],
    );
    assert.equal(corrections.rows.length, 1);
    assert.equal(Number(corrections.rows[0].cost), -0.04);
    assert.equal(Number(corrections.rows[0].runs), -1);
    // Deleting retained raw data does not erase the deduplication receipt or lifetime totals.
    await db.exec("delete from usage_events");
    assert.equal((await ingest([event])).rows[0].n, 0);
    await db.query("update organizations set tier=1 where id=$1", [org.id]);
    await db.query(
      "update monthly_meter set events=9999 where organization_id=$1",
      [org.id],
    );
    await assert.rejects(
      ingest([
        { ...event, id: randomUUID() },
        { ...event, id: randomUUID() },
      ]),
      /limit/,
    );
    assert.equal((await ingest([{ ...event, id: randomUUID() }])).rows[0].n, 1);
    await assert.rejects(ingest([{ ...event, id: randomUUID() }]), /limit/);
    await assert.rejects(
      db.query("select create_product($1,$2)", [org.id, "Too many"]),
      /limit/,
    );
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u2]);
    const visible = await db.query<{ owner_id: string }>(
      "select owner_id from organizations",
    );
    assert.equal(visible.rows.length, 1);
    assert.equal(visible.rows[0].owner_id, u2);
    assert.equal((await db.query("select * from daily_usage")).rows.length, 0);
    await assert.rejects(
      db.exec("update organizations set tier=3"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select ingest_events($1,$2::jsonb)", [key, "[]"]),
      /permission denied/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select claim_alert_delivery($1,current_date,'email','abc') ok",
          [org.id],
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select claim_alert_delivery($1,current_date,'email','abc') ok",
          [org.id],
        )
      ).rows[0].ok,
      false,
    );
    await db.query("select grant_lifetime_tier($1,2,'cs_test')", [org.id]);
    await db.query("select grant_lifetime_tier($1,1,'cs_duplicate')", [org.id]);
    assert.equal(
      (
        await db.query<{ tier: number }>(
          "select tier from organizations where id=$1",
          [org.id],
        )
      ).rows[0].tier,
      2,
    );
  } finally {
    await db.close();
  }
});
