/**
 * Hourly Rollup Edge Function
 * Aggregates llm_events into daily_rollups for fast dashboard queries.
 * Triggered by Supabase cron: "0 * * * *" (every hour)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (_req) => {
  try {
    // Aggregate events from the last 2 hours (overlap to handle late arrivals)
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - 2);

    const { data: events, error } = await supabase
      .from("llm_events")
      .select("project_id, customer_id, feature, cost_usd, occurred_at")
      .gte("occurred_at", windowStart.toISOString());

    if (error) {
      console.error("Failed to fetch events:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    // Aggregate: (project_id, date, customer_id, feature) → {calls, cost}
    const agg = new Map<string, { calls: number; cost: number }>();

    for (const event of events) {
      const date = event.occurred_at.split("T")[0]; // "2026-06-24"
      const key = `${event.project_id}|${date}|${event.customer_id}|${event.feature}`;
      const existing = agg.get(key) ?? { calls: 0, cost: 0 };
      agg.set(key, {
        calls: existing.calls + 1,
        cost: existing.cost + parseFloat(event.cost_usd),
      });
    }

    // Upsert rollups
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

    // Batch upsert in chunks of 500
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
      }
    }

    console.log(`Rollup complete: ${rows.length} aggregated rows from ${events.length} events`);

    return new Response(
      JSON.stringify({ processed: events.length, aggregated: rows.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Rollup failed:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
