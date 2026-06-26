import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { MarginBadge } from "@/components/MarginBadge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { format, parseISO } from "date-fns";

export default function CustomerDetail() {
  const { projectId, customerId } = useParams<{ projectId: string; customerId: string }>();
  const navigate = useNavigate();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", projectId, customerId],
    queryFn: () => api.customers.get(projectId!, customerId!),
    enabled: !!projectId && !!customerId,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Customer not found.
      </div>
    );
  }

  const marginStatus = customer.margin != null
    ? customer.margin < 0.4 ? "risk" : customer.margin < 0.7 ? "watch" : "ok"
    : "ok";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(-1)}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold font-mono">{customer.customer_id}</h1>
            {customer.plan && (
              <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                {customer.plan}
              </span>
            )}
            {customer.margin != null && (
              <MarginBadge margin={customer.margin} status={marginStatus} />
            )}
          </div>
          <div className="flex gap-6 mt-2 text-sm text-muted-foreground">
            <span>Cost (30d): <strong className="text-foreground">{formatCurrency(customer.total_cost)}</strong></span>
            {customer.mrr != null && (
              <span>MRR: <strong className="text-foreground">{formatCurrency(customer.mrr)}</strong></span>
            )}
            <span>Calls: <strong className="text-foreground">{formatNumber(customer.call_count)}</strong></span>
          </div>
        </div>
      </div>

      {/* Cost by day */}
      {customer.cost_by_day.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-card">
            <h2 className="font-semibold text-sm">Daily Cost</h2>
          </div>
          <div className="p-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={customer.cost_by_day} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => format(parseISO(d), "MMM d")}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `$${v}`}
                  tick={{ fontSize: 10 }}
                  width={40}
                />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), "Cost"]}
                  labelFormatter={(d) => format(parseISO(d as string), "MMM d, yyyy")}
                />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Cost by feature */}
      {customer.cost_by_feature.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-card">
            <h2 className="font-semibold text-sm">Cost by Feature</h2>
          </div>
          <div className="divide-y">
            {customer.cost_by_feature.map((f) => {
              const pct = customer.total_cost > 0
                ? (f.cost / customer.total_cost * 100).toFixed(0)
                : "0";
              return (
                <div key={f.feature} className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono">{f.feature}</p>
                    <div className="mt-1.5 bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{formatCurrency(f.cost)}</p>
                    <p className="text-xs text-muted-foreground">{pct}% · {formatNumber(f.calls)} calls</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent calls */}
      {customer.recent_calls.length > 0 && (
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-card">
            <h2 className="font-semibold text-sm">Recent Calls</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Model</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Feature</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Tokens in</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Tokens out</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Cost</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Time</th>
                </tr>
              </thead>
              <tbody>
                {customer.recent_calls.map((call, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono">{call.model}</td>
                    <td className="px-4 py-2.5 font-mono">{call.feature}</td>
                    <td className="px-4 py-2.5 text-right">{formatNumber(call.input_tokens)}</td>
                    <td className="px-4 py-2.5 text-right">{formatNumber(call.output_tokens)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      {formatCurrency(parseFloat(call.cost_usd))}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {format(parseISO(call.occurred_at), "MMM d HH:mm")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
