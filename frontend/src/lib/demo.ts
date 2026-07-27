/**
 * Demo mode: a fully explorable dashboard with a deterministic seeded
 * dataset — no backend, no auth. Active when VITE_DEMO_MODE=1 or when no
 * Supabase project is configured (e.g. the public deployment).
 */

import type {
  AlertConfig,
  CustomerDetail,
  CustomerRow,
  FeatureRow,
  PricingResult,
  Project,
  StripeCustomer,
  TrendPoint,
  TrendResult,
} from "./api";

export const IS_DEMO =
  import.meta.env.VITE_DEMO_MODE === "1" || !import.meta.env.VITE_SUPABASE_URL;

// Mulberry32 — deterministic PRNG so the demo is identical on every load
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

// "Briefly" — a fictional AI meeting-notes SaaS
const PLANS: Array<{ plan: string; mrr: number; names: string[] }> = [
  {
    plan: "Starter",
    mrr: 29,
    names: ["devon@solowork.co", "mina@papertrail.app", "jules@northbeam.io", "sam@quietfox.dev", "ivy@plainsight.so", "theo@driftlab.ai", "noor@stackpine.com", "kai@seafloor.app"],
  },
  {
    plan: "Growth",
    mrr: 99,
    names: ["ops@brightline.ai", "team@copperleaf.io", "eng@fieldday.app", "hello@tallgrass.co", "dev@lanternworks.io", "crew@bluebarn.dev", "team@mosswood.ai", "ops@harborlight.co", "eng@redcedar.app", "team@stonefruit.io"],
  },
  {
    plan: "Scale",
    mrr: 299,
    names: ["platform@meridianhq.com", "ai@vantagerow.com", "eng@ledgerline.co", "core@summitpeak.ai", "platform@ironbridge.io", "eng@atlascove.com"],
  },
];

const FEATURES = [
  { feature: "meeting_summary", weight: 0.4, avgCost: 0.011 },
  { feature: "action_items", weight: 0.25, avgCost: 0.0028 },
  { feature: "research_agent", weight: 0.1, avgCost: 0.19 },
  { feature: "chat_assistant", weight: 0.2, avgCost: 0.0016 },
  { feature: "weekly_digest", weight: 0.05, avgCost: 0.041 },
];

const MODELS = ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-5", "gpt-4o-mini"];

type DemoCustomer = CustomerRow & { activity: number };

function buildCustomers(): DemoCustomer[] {
  const customers: DemoCustomer[] = [];
  for (const tier of PLANS) {
    for (const name of tier.names) {
      const activity = Math.min(1 / Math.pow(1 - rand(), 0.55) - 0.4, 22);
      customers.push({
        customer_id: name,
        plan: tier.plan,
        mrr: tier.mrr,
        activity,
        total_cost: 0,
        call_count: 0,
        margin: null,
        alert_status: "ok",
      });
    }
  }
  // The demo's star: a Starter customer who is dramatically underwater
  customers[0].activity = 26;
  return customers;
}

const customers = buildCustomers();

// Per-customer monthly cost from activity
for (const customer of customers) {
  const calls = Math.round(customer.activity * between(70, 130));
  let cost = 0;
  for (const f of FEATURES) {
    cost += calls * f.weight * f.avgCost * between(0.8, 1.25);
  }
  customer.call_count = calls;
  customer.total_cost = Math.round(cost * 100) / 100;
  customer.margin =
    Math.round(((customer.mrr! - customer.total_cost) / customer.mrr!) * 10000) / 10000;
  customer.alert_status =
    customer.margin < 0.4 ? "risk" : customer.margin < 0.7 ? "watch" : "ok";
}

customers.sort((a, b) => b.total_cost - a.total_cost);

const totalCost = customers.reduce((sum, c) => sum + c.total_cost, 0);
const totalCalls = customers.reduce((sum, c) => sum + c.call_count, 0);

// ── Public fixtures ───────────────────────────────────────────

export const demoProject: Project = {
  id: "demo",
  name: "Briefly (demo)",
  api_key: "mgd_demo_k3y_create_a_real_project_to_get_yours",
  created_at: "2026-06-12T09:00:00Z",
};

export const demoCustomers: CustomerRow[] = customers.map(({ activity, ...row }) => row);

// Share of the bill per feature (research_agent dominates cost despite few
// calls — the story the dashboard should tell).
const FEATURE_SHARES: Record<string, { share: number; callShare: number }> = {
  research_agent: { share: 0.44, callShare: 0.04 },
  meeting_summary: { share: 0.3, callShare: 0.42 },
  weekly_digest: { share: 0.11, callShare: 0.05 },
  action_items: { share: 0.09, callShare: 0.26 },
  chat_assistant: { share: 0.06, callShare: 0.23 },
};

export const demoFeatures: FeatureRow[] = FEATURES.map((f) => {
  const { share, callShare } = FEATURE_SHARES[f.feature];
  const cost = totalCost * share;
  const calls = Math.max(Math.round(totalCalls * callShare), 1);
  return {
    feature: f.feature,
    total_cost: Math.round(cost * 100) / 100,
    call_count: calls,
    avg_cost_per_call: Math.round((cost / calls) * 10000) / 10000,
    pct_of_bill: 0,
  };
}).sort((a, b) => b.total_cost - a.total_cost);

{
  const featureTotal = demoFeatures.reduce((sum, f) => sum + f.total_cost, 0);
  for (const f of demoFeatures) {
    f.pct_of_bill = Math.round((f.total_cost / featureTotal) * 1000) / 10;
  }
}

export function demoTrend(days: number): TrendResult {
  const points: TrendPoint[] = [];
  const today = new Date();
  const dailyBase = totalCost / 30;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const age = i / Math.max(days, 1);
    const growth = 1.25 - age * 0.7; // costs trending up
    const weekend = d.getDay() === 0 || d.getDay() === 6 ? 0.55 : 1;
    const noise = 0.82 + mulberry32(d.getDate() * 7 + d.getMonth() * 31)() * 0.4;
    const cost = dailyBase * growth * weekend * noise;
    points.push({
      date: d.toISOString().slice(0, 10),
      cost: Math.round(cost * 100) / 100,
      calls: Math.round((cost / totalCost) * totalCalls * 30 * 0.033 * 1000) / 1,
    });
  }
  return {
    points,
    total_cost: Math.round(points.reduce((sum, p) => sum + p.cost, 0) * 100) / 100,
    total_calls: points.reduce((sum, p) => sum + p.calls, 0),
  };
}

export const demoSummary = {
  total_cost_mtd: Math.round(totalCost * 0.87 * 100) / 100,
  projected_month_end: Math.round(totalCost * 1.02 * 100) / 100,
  pct_change_vs_last_month: 34.2,
  customers_at_risk: customers.filter((c) => (c.margin ?? 1) < 0.4).length,
  top_cost_driver_feature: demoFeatures[0].feature,
  total_customers: customers.length,
};

export function demoCustomerDetail(customerId: string): CustomerDetail {
  const row =
    customers.find((c) => c.customer_id === customerId) ?? customers[0];
  const rng = mulberry32(customerId.length * 101);
  const byFeature = FEATURES.map((f) => ({
    feature: f.feature,
    cost: Math.round(row.total_cost * f.weight * (0.7 + rng() * 0.6) * 100) / 100,
    calls: Math.round(row.call_count * f.weight),
  })).sort((a, b) => b.cost - a.cost);

  const byDay: CustomerDetail["cost_by_day"] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const weekend = d.getDay() === 0 || d.getDay() === 6 ? 0.5 : 1;
    byDay.push({
      date: d.toISOString().slice(0, 10),
      cost: Math.round((row.total_cost / 30) * weekend * (0.6 + rng() * 0.9) * 100) / 100,
      calls: Math.round((row.call_count / 30) * weekend * (0.6 + rng() * 0.9)),
    });
  }

  const recentCalls: CustomerDetail["recent_calls"] = [];
  for (let i = 0; i < 20; i++) {
    const f = FEATURES[Math.floor(rng() * FEATURES.length)];
    const model = MODELS[Math.floor(rng() * MODELS.length)];
    const inputTokens = Math.round(between(800, 18000));
    const outputTokens = Math.round(between(120, 2400));
    const when = new Date(today.getTime() - i * 1000 * 60 * between(9, 240));
    recentCalls.push({
      model,
      feature: f.feature,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: (inputTokens * 3e-6 + outputTokens * 15e-6).toFixed(6),
      occurred_at: when.toISOString(),
      run_id: f.feature === "research_agent" ? `run_${Math.floor(rng() * 1e8).toString(16)}` : null,
    });
  }

  const { activity, ...base } = row;
  return { ...base, cost_by_feature: byFeature, cost_by_day: byDay, recent_calls: recentCalls };
}

export function demoCalculator(targetMargin: number): PricingResult {
  const tiers = PLANS.map((tier) => {
    const tierCustomers = customers.filter((c) => c.plan === tier.plan);
    const costs = tierCustomers.map((c) => c.total_cost).sort((a, b) => a - b);
    const calls = tierCustomers.map((c) => c.call_count).sort((a, b) => a - b);
    const pick = (arr: number[], p: number) =>
      arr[Math.min(Math.floor((p / 100) * (arr.length - 1)), arr.length - 1)] ?? 0;
    const medianCogs = pick(costs, 50);
    const p90Cogs = pick(costs, 90);
    const p99Cogs = pick(costs, 99);
    const recommended = medianCogs / (1 - targetMargin);
    const marginAt = (cogs: number) =>
      Math.round(((tier.mrr - cogs) / tier.mrr) * 10000) / 10000;
    return {
      tier_name: tier.plan,
      customer_count: tierCustomers.length,
      median_calls: pick(calls, 50),
      median_cogs: Math.round(medianCogs * 100) / 100,
      p90_calls: pick(calls, 90),
      p90_cogs: Math.round(p90Cogs * 100) / 100,
      p99_cogs: Math.round(p99Cogs * 100) / 100,
      break_even_price: Math.round(medianCogs * 100) / 100,
      recommended_price: Math.round(recommended * 100) / 100,
      current_price: tier.mrr,
      margin_at_median: marginAt(medianCogs),
      margin_at_p90: marginAt(p90Cogs),
      margin_at_p99: marginAt(p99Cogs),
      usage_cap_recommendation:
        marginAt(p99Cogs) < 0.4 ? Math.round(pick(calls, 90) * 1.2) : null,
    };
  });
  return { target_margin: targetMargin, tiers };
}

export const demoAlerts: AlertConfig[] = [
  {
    id: "demo-alert-1",
    alert_type: "margin_threshold",
    threshold: 50,
    channel: "email",
    destination: "founder@briefly.app",
    last_fired_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    enabled: true,
  },
  {
    id: "demo-alert-2",
    alert_type: "bill_forecast",
    threshold: 500,
    channel: "slack",
    destination: "https://hooks.slack.com/services/T00/B00/demo",
    last_fired_at: null,
    enabled: true,
  },
];

export const demoStripeCustomers: StripeCustomer[] = customers.slice(0, 12).map((c) => ({
  customer_id: c.customer_id,
  stripe_customer: `cus_${c.customer_id.split("@")[0].slice(0, 10)}`,
  current_mrr_usd: c.mrr,
  plan_name: c.plan,
}));

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

/** Small artificial latency so loading states render naturally. */
export async function demoResponse<T>(value: T): Promise<T> {
  await delay(80 + Math.random() * 160);
  return value;
}
