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

export const api = {
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

  // ── Stripe ─────────────────────────────────────────────
  stripe: {
    listCustomers: (projectId: string) =>
      apiFetch<StripeCustomer[]>(`/stripe/customers/${projectId}`),
    mapCustomer: (projectId: string, body: { customer_id: string; stripe_customer: string }) =>
      apiFetch<StripeCustomer>(`/stripe/customers/${projectId}/map`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
};

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

export type StripeCustomer = {
  customer_id: string;
  stripe_customer: string;
  current_mrr_usd: number | null;
  plan_name: string | null;
};
