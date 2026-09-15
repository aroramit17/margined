import type { SupabaseClient } from "@supabase/supabase-js";
import { Customer, Dataset, sum } from "./engine";
const DAY = 86400000;
export async function loadDataset(
  db: SupabaseClient,
  org: {
    id: string;
    name: string;
    tier: number;
    stripe_account_id: string | null;
  },
  product = "all",
): Promise<Dataset> {
  const now = new Date(),
    today = now.toISOString().slice(0, 10);
  const { data: products, error: pe } = await db
    .from("products")
    .select("id,name")
    .eq("organization_id", org.id);
  if (pe) throw pe;
  const subs: {
    id: string;
    customer_id: string;
    customer_name: string;
    customer_email: string;
    plan: string;
    revenue: number;
    period_start: string;
    period_end: string;
    product_id: string | null;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("subscriptions")
      .select("*")
      .eq("organization_id", org.id)
      .eq("status", "active")
      .gt("period_end", now.toISOString())
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    subs.push(...data);
    if (data.length < 1000) break;
  }
  let start = today;
  for (const s of subs ?? [])
    if (s.period_start.slice(0, 10) < start)
      start = s.period_start.slice(0, 10);
  const priorStart = new Date(Date.parse(start) - 32 * DAY)
    .toISOString()
    .slice(0, 10);
  const rows: {
    customer_id: string;
    day: string;
    feature: string;
    model: string;
    cost: number;
    runs: number;
    product_id: string;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    let q = db
      .from("daily_usage")
      .select("*")
      .eq("organization_id", org.id)
      .gte("day", priorStart)
      .lte("day", today)
      .order("day")
      .order("product_id")
      .order("customer_id")
      .order("feature")
      .order("model")
      .range(offset, offset + 999);
    if (product !== "all") q = q.eq("product_id", product);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  for (let offset = 0; ; offset += 1000) {
    const { data: adjustments, error } = await db
      .rpc("billing_boundary_adjustments", {
        p_org: org.id,
        p_product: product === "all" ? null : product,
      })
      .order("customer_id")
      .order("product_id")
      .order("day")
      .order("feature")
      .order("model")
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...adjustments);
    if (adjustments.length < 1000) break;
  }
  // Billing subscriptions must be explicitly mapped to a product to appear in a product-specific view.
  const relevant = (subs ?? []).filter(
    (s) => product === "all" || s.product_id === product,
  );
  const groups = new Map<string, typeof relevant>();
  for (const s of relevant) {
    const arr = groups.get(s.customer_id) ?? [];
    arr.push(s);
    groups.set(s.customer_id, arr);
  }
  const customers: Customer[] = [];
  for (const [id, subscriptions] of groups) {
    const s = subscriptions[0];
    if (
      subscriptions.some(
        (x) =>
          x.period_start !== s.period_start || x.period_end !== s.period_end,
      )
    )
      throw Error(
        "A customer has subscriptions with different billing periods; align them before using this beta.",
      );
    const startDate = s.period_start.slice(0, 10),
      endDate = s.period_end.slice(0, 10);
    const usage = rows.filter(
      (r) => r.customer_id === id && r.day >= startDate && r.day <= endDate,
    );
    const daysInPeriod = Math.ceil(
        (Date.parse(endDate) - Date.parse(startDate)) / DAY,
      ),
      daysElapsed = Math.min(
        daysInPeriod,
        Math.max(
          1,
          Math.floor((Date.parse(today) - Date.parse(startDate)) / DAY) + 1,
        ),
      );
    const revenue = sum(subscriptions, (x) => Number(x.revenue));
    const observedDates = Math.max(
      1,
      Math.floor((Date.parse(today) - Date.parse(startDate)) / DAY) + 1,
    );
    const daily = Array.from({ length: observedDates }, (_, i) => {
      const date = new Date(Date.parse(startDate) + i * DAY)
        .toISOString()
        .slice(0, 10);
      return {
        date,
        revenue:
          ((revenue / daysInPeriod) *
            Math.max(
              0,
              Math.min(Date.parse(date) + DAY, Date.parse(s.period_end)) -
                Math.max(Date.parse(date), Date.parse(s.period_start)),
            )) /
          DAY,
        cost: sum(
          usage.filter((r) => r.day === date),
          (r) => Number(r.cost),
        ),
      };
    });
    function group(key: "feature" | "model") {
      return [...new Set(usage.map((r) => r[key]))]
        .map((name) => ({
          name,
          cost: sum(
            usage.filter((r) => r[key] === name),
            (r) => Number(r.cost),
          ),
          runs: sum(
            usage.filter((r) => r[key] === name),
            (r) => Number(r.runs),
          ),
        }))
        .sort((a, b) => b.cost - a.cost);
    }
    const previousCost = sum(
      rows.filter(
        (r) =>
          r.customer_id === id &&
          r.day < startDate &&
          r.day >=
            new Date(Date.parse(startDate) - daysElapsed * DAY)
              .toISOString()
              .slice(0, 10),
      ),
      (r) => Number(r.cost),
    );
    customers.push({
      id,
      name: s.customer_name,
      email: s.customer_email,
      plan: subscriptions.map((s) => s.plan).join(" + "),
      revenue,
      cost: sum(usage, (r) => Number(r.cost)),
      previousCost,
      daysElapsed,
      daysInPeriod,
      recentDailyCost:
        sum(daily.slice(-7), (d) => d.cost) / Math.min(7, daysElapsed),
      features: group("feature"),
      models: group("model"),
      daily,
      currency: "usd",
    });
  }
  // Keep usage with no subscription visible as zero-revenue customers.
  const known = new Set(customers.map((c) => c.id));
  const unassigned = rows.filter(
    (r) => !known.has(r.customer_id) && r.day >= today.slice(0, 7) + "-01",
  );
  for (const id of new Set(unassigned.map((r) => r.customer_id))) {
    const usage = unassigned.filter((r) => r.customer_id === id);
    const daysElapsed = now.getUTCDate();
    const daysInPeriod = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const daily = Array.from({ length: daysElapsed }, (_, i) => ({
      date: `${today.slice(0, 8)}${String(i + 1).padStart(2, "0")}`,
      revenue: 0,
      cost: sum(
        usage.filter((r) => Number(r.day.slice(-2)) === i + 1),
        (r) => Number(r.cost),
      ),
    }));
    const group = (key: "feature" | "model") =>
      [...new Set(usage.map((r) => r[key]))].map((name) => ({
        name,
        cost: sum(
          usage.filter((r) => r[key] === name),
          (r) => Number(r.cost),
        ),
        runs: sum(
          usage.filter((r) => r[key] === name),
          (r) => Number(r.runs),
        ),
      }));
    customers.push({
      id,
      name: id,
      email: "No matching subscription",
      plan: "Unmapped",
      revenue: 0,
      cost: sum(usage, (r) => Number(r.cost)),
      previousCost: 0,
      daysElapsed,
      daysInPeriod,
      recentDailyCost:
        sum(daily.slice(-7), (d) => d.cost) / Math.min(7, daysElapsed),
      features: group("feature"),
      models: group("model"),
      daily,
      currency: "usd",
    });
  }
  const dates = [
    ...new Set(customers.flatMap((c) => c.daily.map((d) => d.date))),
  ].sort();
  return {
    customers,
    daily: dates.map((date) => ({
      date,
      revenue: sum(
        customers,
        (c) => c.daily.find((d) => d.date === date)?.revenue ?? 0,
      ),
      cost: sum(
        customers,
        (c) => c.daily.find((d) => d.date === date)?.cost ?? 0,
      ),
    })),
    products: products ?? [],
    events: sum(rows, (r) => Number(r.runs)),
    period: "Current billing periods",
    mode: "live",
    stripeConnected: Boolean(org.stripe_account_id),
    organization: org.name,
    tier: org.tier,
  };
}
