import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api, TierAnalysis } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function PricingCalculator() {
  const { projectId } = useParams();
  const [targetMargin, setTargetMargin] = useState(0.70);

  const { data, isLoading, error } = useQuery({
    queryKey: ["calculator", projectId, targetMargin],
    queryFn: () => api.calculator(projectId!, targetMargin),
    enabled: !!projectId,
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Pricing Calculator</h1>
        <p className="text-muted-foreground text-sm">
          Use the last 30 days of usage to estimate what to charge to reach your margin target.
        </p>
      </div>

      {/* Target margin control */}
      <div className="border rounded-xl px-5 py-4 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Target gross margin</label>
          <span className="text-xl font-bold text-primary">{(targetMargin * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min={0.30}
          max={0.95}
          step={0.05}
          value={targetMargin}
          onChange={(e) => setTargetMargin(parseFloat(e.target.value))}
          className="w-full accent-foreground"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>30%</span>
          <span>70% (recommended)</span>
          <span>95%</span>
        </div>
      </div>

      <div className="rounded-xl border bg-card px-5 py-4 text-sm space-y-2">
        <h2 className="font-medium">How to read usage and cost</h2>
        <p className="text-muted-foreground">
          Each figure is per customer, per month, based on the last 30 days.
          Median is the midpoint: half of customers fall below it and half above.
          P90 and P99 estimate the levels that 90% and 99% of customers fall at or below.
        </p>
        <p className="text-xs text-muted-foreground">
          API calls measure usage; cost (COGS) is the cost to serve that usage.
          Calls and costs are ranked separately, so they may represent different customers.
          With few customers, P90 and P99 can be the same.
        </p>
      </div>

      {/* Tier results */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="border border-destructive/50 bg-destructive/5 rounded-xl px-4 py-3 text-sm text-destructive">
          Failed to load pricing data. Make sure you have customer usage data in the last 30 days.
        </div>
      )}

      {data?.tiers.length === 0 && !isLoading && (
        <div className="border rounded-xl px-4 py-8 text-center text-muted-foreground text-sm">
          No usage data yet. Send events via the SDK to populate the pricing calculator.
        </div>
      )}

      {data?.tiers.map((tier) => (
        <TierCard key={tier.tier_name} tier={tier} targetMargin={targetMargin} />
      ))}
    </div>
  );
}

function TierCard({ tier, targetMargin }: { tier: TierAnalysis; targetMargin: number }) {
  const marginOk = (v: number) => v >= targetMargin;

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
        <div>
          <h2 className="font-semibold">{tier.tier_name}</h2>
          <p className="text-xs text-muted-foreground">{tier.customer_count} customers</p>
        </div>
        {tier.current_price && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Current price</p>
            <p className="text-lg font-bold">{formatCurrency(tier.current_price)}/mo</p>
          </div>
        )}
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* Usage stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Typical usage (median)</p>
            <p className="font-semibold">{formatNumber(tier.median_calls)} API calls/month</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(tier.median_cogs)}/month cost</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Heavy usage (P90)</p>
            <p className="font-semibold">{formatNumber(tier.p90_calls)} API calls/month</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(tier.p90_cogs)}/month cost</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Very heavy usage (P99)</p>
            <p className="font-semibold">{formatNumber(tier.p99_calls)} API calls/month</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(tier.p99_cogs)}/month cost</p>
          </div>
        </div>

        {/* Price recommendation */}
        <div className="bg-muted/40 rounded-md px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Break-even price (typical cost)</span>
            <span className="figure text-sm">{formatCurrency(tier.break_even_price)}/mo</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Recommended price <span className="text-xs text-muted-foreground">(for {(targetMargin * 100).toFixed(0)}% margin)</span>
            </span>
            <span className="figure text-lg font-semibold">
              {formatCurrency(tier.recommended_price)}/mo
            </span>
          </div>
        </div>

        {/* Margin at percentiles */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Margin at current price {tier.current_price ? `(${formatCurrency(tier.current_price)}/mo)` : ""}
          </p>
          <MarginRow
            label="Typical cost (median)"
            margin={tier.margin_at_median}
            targetMargin={targetMargin}
          />
          <MarginRow
            label="High cost (P90)"
            margin={tier.margin_at_p90}
            targetMargin={targetMargin}
          />
          <MarginRow
            label="Very high cost (P99)"
            margin={tier.margin_at_p99}
            targetMargin={targetMargin}
            highlight
          />
        </div>

        {/* Usage cap recommendation */}
        {tier.usage_cap_recommendation && (
          <div className="flex items-start gap-2 bg-watch/10 border border-watch/30 rounded-md px-3 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 text-watch shrink-0 mt-0.5" />
            <p>
              Consider a usage cap at{" "}
              <strong className="figure">{formatNumber(tier.usage_cap_recommendation)} API calls/month</strong>{" "}
              per customer on this tier to protect margins from very heavy usage.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MarginRow({
  label,
  margin,
  targetMargin,
  highlight,
}: {
  label: string;
  margin: number;
  targetMargin: number;
  highlight?: boolean;
}) {
  const pct = (margin * 100).toFixed(1);
  const ok = margin >= targetMargin;
  const tone = ok ? "profit" : margin >= 0 ? "watch" : "loss";
  const toneText = { profit: "text-profit", watch: "text-watch", loss: "text-loss" }[tone];
  const toneDot = { profit: "bg-profit", watch: "bg-watch", loss: "bg-loss" }[tone];

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-medium figure ${toneText}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${toneDot}`} />
        {pct}%
      </span>
    </div>
  );
}
