/**
 * Hourly Rollup Edge Function
 * Aggregates llm_events into daily_rollups for fast dashboard queries.
 * Triggered by Supabase cron: "0 * * * *" (every hour)
 *
 * Correctness: each run recomputes the FULL current and previous UTC day
 * from raw events and upserts the totals. This is idempotent — re-running
 * never double-counts, and late-arriving events for yesterday are folded in.
 * (Aggregating only a trailing window and upserting would overwrite a day's
 * accumulated totals with a partial window.)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PAGE_SIZE = 1000;

Deno.serve(async (_req) => {
  try {
    // Recompute from the start of the previous UTC day.
    const windowStart = new Date();
    windowStart.setUTCDate(windowStart.getUTCDate() - 1);
    windowStart.setUTCHours(0, 0, 0, 0);

    // Aggregate: (project_id, date, customer_id, feature) → {calls, cost}
    const agg = new Map<string, { calls: number; cost: number }>();
    let fetched = 0;
    let page = 0;

    while (true) {
      const { data: events, error } = await supabase
        .from("llm_events")
        .select("project_id, customer_id, feature, cost_usd, occurred_at")
        .gte("occurred_at", windowStart.toISOString())
        .order("occurred_at", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) {
        console.error("Failed to fetch events:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      }
      if (!events || events.length === 0) break;

      for (const event of events) {
        const date = event.occurred_at.split("T")[0];
        const key = `${event.project_id}|${date}|${event.customer_id}|${event.feature}`;
        const existing = agg.get(key) ?? { calls: 0, cost: 0 };
        agg.set(key, {
          calls: existing.calls + 1,
          cost: existing.cost + parseFloat(event.cost_usd),
        });
      }

      fetched += events.length;
      if (events.length < PAGE_SIZE) break;
      page++;
    }

    if (agg.size === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    const rows = Array.from(agg.entries()).map(([key, data]) => {
      const [project_id, date, customer_id, feature] = key.split("|");
      return {
        project_id,
        date,
        customer_id,
        feature,
        total_calls: data.calls,
        total_cost: data.cost.toFixed(6),
      };
    });

    // Batch upsert in chunks of 500 — totals REPLACE the row, which is safe
    // because each total was computed from the complete day's events.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error: upsertError } = await supabase
        .from("daily_rollups")
        .upsert(chunk, {
          onConflict: "project_id,date,customer_id,feature",
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        return new Response(JSON.stringify({ error: upsertError.message }), { status: 500 });
      }
    }

    console.log(`Rollup complete: ${rows.length} aggregated rows from ${fetched} events`);

    return new Response(
      JSON.stringify({ processed: fetched, aggregated: rows.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Rollup failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
