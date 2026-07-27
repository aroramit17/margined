import { supabase } from "./supabase";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Projects ──────────────────────────────────────────────
export type Project = {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
};

const realApi = {
  projects: {
    list: () => apiFetch<Project[]>("/projects"),
    create: (name: string) =>
      apiFetch<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    get: (id: string) => apiFetch<Project>(`/projects/${id}`),
    rotateKey: (id: string) =>
      apiFetch<Project>(`/projects/${id}/rotate-key`, { method: "POST" }),
    delete: (id: string) =>
      apiFetch<void>(`/projects/${id}`, { method: "DELETE" }),
  },

  // ── Summary ────────────────────────────────────────────
  summary: (projectId: string) =>
    apiFetch<{
      total_cost_mtd: number;
      projected_month_end: number;
      pct_change_vs_last_month: number | null;
      customers_at_risk: number;
      top_cost_driver_feature: string | null;
      total_customers: number;
    }>(`/projects/${projectId}/summary`),

  // ── Trend ──────────────────────────────────────────────
  trend: (projectId: string, days = 30) =>
    apiFetch<TrendResult>(`/projects/${projectId}/trend?days=${days}`),

  // ── Customers ──────────────────────────────────────────
  customers: {
    list: (projectId: string, params?: { from?: string; to?: string }) => {
      const qs = params
        ? "?" + new URLSearchParams(params as Record<string, string>).toString()
        : "";
      return apiFetch<CustomerRow[]>(`/projects/${projectId}/customers${qs}`);
    },
    get: (projectId: string, customerId: string) =>
      apiFetch<CustomerDetail>(`/projects/${projectId}/customers/${customerId}`),
  },

  // ── Features ───────────────────────────────────────────
  features: (projectId: string, params?: { from?: string; to?: string }) => {
    const qs = params
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";
    return apiFetch<FeatureRow[]>(`/projects/${projectId}/features${qs}`);
  },

  // ── Pricing Calculator ─────────────────────────────────
  calculator: (projectId: string, targetMargin = 0.7) =>
    apiFetch<PricingResult>(
      `/projects/${projectId}/pricing-calculator?target_margin=${targetMargin}`,
    ),

  // ── Alerts ─────────────────────────────────────────────
  alerts: {
    list: (projectId: string) =>
      apiFetch<AlertConfig[]>(`/projects/${projectId}/alerts`),
    create: (projectId: string, body: CreateAlertBody) =>
      apiFetch<AlertConfig>(`/projects/${projectId}/alerts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    delete: (projectId: string, alertId: string) =>
      apiFetch<void>(`/projects/${projectId}/alerts/${alertId}`, {
        method: "DELETE",
      }),
    toggle: (projectId: string, alertId: string, enabled: boolean) =>
      apiFetch<AlertConfig>(`/projects/${projectId}/alerts/${alertId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
  },

  // ── Billing (Margined's own) ───────────────────────────
  billing: {
    status: () => apiFetch<BillingStatus>("/billing/status"),
    checkout: (plan: "starter" | "growth") =>
      apiFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      }),
    portal: () => apiFetch<{ url: string }>("/billing/portal", { method: "POST" }),
  },

  // ── Stripe ─────────────────────────────────────────────
  stripe: {
    listCustomers: (projectId: string) =>
      apiFetch<StripeCustomer[]>(`/stripe/customers/${projectId}`),
    mapCustomer: (projectId: string, body: { customer_id: string; stripe_customer: string }) =>
      apiFetch<StripeCustomer>(`/stripe/customers/${projectId}/map`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    refresh: (projectId: string) =>
      apiFetch<{ refreshed: number }>(`/stripe/customers/${projectId}/refresh`, {
        method: "POST",
      }),
  },
};

// ── Demo mode ──────────────────────────────────────────────
// When no backend is configured (public deployment), the whole dashboard
// runs on a deterministic seeded dataset — same shapes, no network.

function buildDemoApi(): typeof realApi {
  // Lazy import keeps the demo dataset out of the bundle's hot path
  const demo = () => import("./demo");
  return {
    projects: {
      list: () => demo().then((d) => d.demoResponse([d.demoProject])),
      create: () => demo().then((d) => d.demoResponse(d.demoProject)),
      get: () => demo().then((d) => d.demoResponse(d.demoProject)),
      rotateKey: () => demo().then((d) => d.demoResponse(d.demoProject)),
      delete: () => Promise.resolve(undefined),
    },
    summary: () => demo().then((d) => d.demoResponse(d.demoSummary)),
    trend: (_projectId: string, days = 30) =>
      demo().then((d) => d.demoResponse(d.demoTrend(days))),
    customers: {
      list: () => demo().then((d) => d.demoResponse(d.demoCustomers)),
      get: (_projectId: string, customerId: string) =>
        demo().then((d) => d.demoResponse(d.demoCustomerDetail(customerId))),
    },
    features: () => demo().then((d) => d.demoResponse(d.demoFeatures)),
    calculator: (_projectId: string, targetMargin = 0.7) =>
      demo().then((d) => d.demoResponse(d.demoCalculator(targetMargin))),
    alerts: {
      list: () => demo().then((d) => d.demoResponse(d.demoAlerts)),
      create: (_projectId: string, body: CreateAlertBody) =>
        demo().then((d) =>
          d.demoResponse({ ...d.demoAlerts[0], ...body, id: `demo-${Date.now()}` }),
        ),
      delete: () => Promise.resolve(undefined),
      toggle: (_projectId: string, _alertId: string, enabled: boolean) =>
        demo().then((d) => d.demoResponse({ ...d.demoAlerts[0], enabled })),
    },
    billing: {
      status: () =>
        Promise.resolve({
          plan: "starter" as const,
          events_used: 412_384,
          events_limit: 1_000_000,
          month: new Date().toISOString().slice(0, 7),
        }),
      checkout: () => Promise.resolve({ url: "#" }),
      portal: () => Promise.resolve({ url: "#" }),
    },
    stripe: {
      listCustomers: () => demo().then((d) => d.demoResponse(d.demoStripeCustomers)),
      mapCustomer: (_projectId: string, body: { customer_id: string; stripe_customer: string }) =>
        demo().then((d) =>
          d.demoResponse({ ...body, current_mrr_usd: 99, plan_name: "Growth" }),
        ),
      refresh: () => Promise.resolve({ refreshed: 0 }),
    },
  };
}

import { isDemoActive } from "./demo";

const demoApi = buildDemoApi();

// Per-call delegation so one page load can serve both a real session and a
// /demo visitor without a rebuild.
function delegate(path: string[]): unknown {
  return new Proxy(function () {} as unknown as object, {
    get: (_target, prop: string) => delegate([...path, prop]),
    apply: (_target, _thisArg, args: unknown[]) => {
      let impl: unknown = isDemoActive() ? demoApi : realApi;
      for (const key of path) impl = (impl as Record<string, unknown>)[key];
      return (impl as (...a: unknown[]) => unknown)(...args);
    },
  });
}

export const api = delegate([]) as typeof realApi;

// ── Types ──────────────────────────────────────────────────
export type CustomerRow = {
  customer_id: string;
  total_cost: number;
  call_count: number;
  mrr: number | null;
  margin: number | null;
  plan: string | null;
  alert_status: "ok" | "watch" | "risk";
};

export type CustomerDetail = CustomerRow & {
  cost_by_feature: { feature: string; cost: number; calls: number }[];
  cost_by_day: { date: string; cost: number; calls: number }[];
  recent_calls: {
    model: string;
    feature: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: string;
    occurred_at: string;
    run_id: string | null;
  }[];
};

export type TrendPoint = {
  date: string;
  cost: number;
  calls: number;
};

export type TrendResult = {
  points: TrendPoint[];
  total_cost: number;
  total_calls: number;
};

export type FeatureRow = {
  feature: string;
  total_cost: number;
  call_count: number;
  avg_cost_per_call: number;
  pct_of_bill: number;
};

export type TierAnalysis = {
  tier_name: string;
  customer_count: number;
  median_calls: number;
  median_cogs: number;
  p90_calls: number;
  p90_cogs: number;
  p99_cogs: number;
  break_even_price: number;
  recommended_price: number;
  current_price: number | null;
  margin_at_median: number;
  margin_at_p90: number;
  margin_at_p99: number;
  usage_cap_recommendation: number | null;
};

export type PricingResult = {
  target_margin: number;
  tiers: TierAnalysis[];
};

export type AlertConfig = {
  id: string;
  alert_type: "margin_threshold" | "feature_spend" | "bill_forecast";
  threshold: number;
  channel: "email" | "slack";
  destination: string;
  last_fired_at: string | null;
  enabled: boolean;
};

export type CreateAlertBody = {
  alert_type: "margin_threshold" | "feature_spend" | "bill_forecast";
  threshold: number;
  channel: "email" | "slack";
  destination: string;
};

export type BillingStatus = {
  plan: "free" | "starter" | "growth";
  events_used: number;
  events_limit: number | null;
  month: string;
};

export type StripeCustomer = {
  customer_id: string;
  stripe_customer: string;
  current_mrr_usd: number | null;
  plan_name: string | null;
};
