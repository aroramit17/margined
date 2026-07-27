import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  TrendingUp,
  Users,
  DollarSign,
  ExternalLink,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api, CustomerRow, FeatureRow } from "@/lib/api";
import { MarginBadge } from "@/components/MarginBadge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { format, parseISO } from "date-fns";

export default function Dashboard() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const pid = projectId ?? projects[0]?.id;

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary", pid],
    queryFn: () => api.summary(pid!),
    enabled: !!pid,
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ["customers", pid],
    queryFn: () => api.customers.list(pid!),
    enabled: !!pid,
  });

  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ["features", pid],
    queryFn: () => api.features(pid!),
    enabled: !!pid,
  });

  if (!pid) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">No projects yet.</p>
        <Link
          to="/onboarding"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium"
        >
          Create your first project
        </Link>
      </div>
    );
  }

  const pctChange = summary?.pct_change_vs_last_month;
  const pctChangeLabel =
    pctChange != null ? `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}%` : null;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="LLM Cost MTD"
          value={summary ? formatCurrency(summary.total_cost_mtd) : "—"}
          sub={summary ? `On track for ${formatCurrency(summary.projected_month_end)}` : ""}
          loading={summaryLoading}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatCard
          label="Cost vs last month"
          value={pctChangeLabel ?? "—"}
          sub={pctChange != null && pctChange > 20 ? "Growing fast" : ""}
          loading={summaryLoading}
          icon={<TrendingUp className="h-4 w-4" />}
          highlight={pctChange != null && pctChange > 30}
          tone="watch"
        />
        <StatCard
          label="Paying Customers"
          value={summary ? formatNumber(summary.total_customers) : "—"}
          sub=""
          loading={summaryLoading}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="At-Risk Customers"
          value={summary ? String(summary.customers_at_risk) : "—"}
          sub={summary?.customers_at_risk ? "Margin < 40%" : "All healthy"}
          loading={summaryLoading}
          icon={<AlertTriangle className="h-4 w-4" />}
          highlight={!!summary?.customers_at_risk}
        />
      </div>

      {/* Customers + Features */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Customer table — 3 cols */}
        <div className="lg:col-span-3 border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
            <h2 className="font-semibold text-sm">Customers</h2>
            <span className="text-xs text-muted-foreground">{customers.length} total</span>
          </div>
          {customersLoading ? (
            <LoadingRows n={5} />
          ) : customers.length === 0 ? (
            <EmptyState message="No customer data yet. Send your first event with the SDK." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="eyebrow text-left px-4 py-2 font-medium">Customer</th>
                    <th className="eyebrow text-left px-4 py-2 font-medium">Plan</th>
                    <th className="eyebrow text-right px-4 py-2 font-medium">MRR</th>
                    <th className="eyebrow text-right px-4 py-2 font-medium whitespace-nowrap">Cost, 30d</th>
                    <th className="eyebrow text-right px-4 py-2 font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <CustomerTableRow key={c.customer_id} customer={c} projectId={pid} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Feature table — 2 cols */}
        <div className="lg:col-span-2 border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
            <h2 className="font-semibold text-sm">Features</h2>
            <Link
              to={`/dashboard/${pid}/pricing`}
              className="text-xs text-primary flex items-center gap-1 hover:underline"
            >
              Pricing calc
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {featuresLoading ? (
            <LoadingRows n={4} />
          ) : features.length === 0 ? (
            <EmptyState message="No feature data yet." />
          ) : (
            <div className="divide-y">
              {features.map((f) => (
                <FeatureTableRow key={f.feature} feature={f} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trend chart */}
      <TrendChart projectId={pid} />
    </div>
  );
}

function CustomerTableRow({ customer: c, projectId }: { customer: CustomerRow; projectId: string }) {
  const navigate = useNavigate();
  return (
    <tr
      className="border-b last:border-0 h-[38px] hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => navigate(`/dashboard/${projectId}/customers/${c.customer_id}`)}
    >
      <td className="px-4 font-mono text-xs text-foreground">
        {c.customer_id.length > 26 ? c.customer_id.slice(0, 24) + "…" : c.customer_id}
      </td>
      <td className="px-4 text-xs text-muted-foreground">{c.plan ?? "—"}</td>
      <td className="px-4 text-right text-xs figure">
        {c.mrr != null ? formatCurrency(c.mrr) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-4 text-right text-xs figure">{formatCurrency(c.total_cost)}</td>
      <td className="px-4 text-right">
        {c.margin != null ? (
          <MarginBadge margin={c.margin} status={c.alert_status} />
        ) : (
          <span className="text-xs text-muted-foreground">No Stripe</span>
        )}
      </td>
    </tr>
  );
}

function FeatureTableRow({ feature: f }: { feature: FeatureRow }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-mono truncate">{f.feature}</p>
        <div className="mt-1.5 bg-muted rounded-full h-1 overflow-hidden">
          <div
            className={`h-full rounded-full ${f.pct_of_bill > 40 ? "bg-watch" : "bg-foreground/50"}`}
            style={{ width: `${Math.min(f.pct_of_bill, 100)}%` }}
          />
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[13px] font-medium figure">{formatCurrency(f.total_cost)}</p>
        <p className="text-xs text-muted-foreground figure">
          {f.pct_of_bill}% · {formatNumber(f.call_count)} calls
        </p>
      </div>
    </div>
  );
}

function TrendChart({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(30);
  const { data: trend, isLoading } = useQuery({
    queryKey: ["trend", projectId, days],
    queryFn: () => api.trend(projectId, days),
  });

  const hasData = (trend?.total_calls ?? 0) > 0;

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-baseline gap-3">
          <h2 className="font-semibold text-sm">Daily LLM Cost</h2>
          {trend && hasData && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCurrency(trend.total_cost)} · {formatNumber(trend.total_calls)} calls
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {[7, 30, 90].map((option) => (
            <button
              key={option}
              onClick={() => setDays(option)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                days === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 h-56">
        {isLoading ? (
          <div className="h-full bg-muted rounded animate-pulse" />
        ) : !hasData ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Send events with the SDK to populate the trend chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend!.points} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => format(parseISO(d), "MMM d")}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                minTickGap={32}
              />
              <YAxis
                tickFormatter={(v) => `$${v}`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number, name: string) =>
                  name === "cost" ? [formatCurrency(value), "Cost"] : [formatNumber(value), "Calls"]
                }
                labelFormatter={(d) => format(parseISO(d as string), "EEE, MMM d")}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="hsl(var(--primary))"
                strokeWidth={1.5}
                fill="url(#costFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  loading,
  icon,
  highlight,
  tone = "loss",
}: {
  label: string;
  value: string;
  sub: string;
  loading: boolean;
  icon: React.ReactNode;
  highlight?: boolean;
  tone?: "loss" | "watch";
}) {
  const highlightClass =
    tone === "watch" ? "border-watch/40 bg-watch/5" : "border-loss/40 bg-loss/5";
  return (
    <div className={`border rounded-lg px-4 py-3.5 ${highlight ? highlightClass : "bg-card"}`}>
      <div className="flex items-center gap-1.5 mb-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5 text-muted-foreground">
        {icon}
        <span className="eyebrow">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-24 bg-muted rounded animate-pulse" />
      ) : (
        <p className="text-[26px] leading-8 font-semibold figure tracking-tight">{value}</p>
      )}
      {sub && <p className="text-xs text-muted-foreground mt-1 figure">{sub}</p>}
    </div>
  );
}

function LoadingRows({ n }: { n: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-8 bg-muted rounded animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-12 px-4 text-sm text-muted-foreground text-center">
      {message}
    </div>
  );
}
