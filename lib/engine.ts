export type Daily = { date: string; revenue: number; cost: number };
export type Breakdown = { name: string; cost: number; runs: number };
export type Customer = {
  id: string;
  name: string;
  email: string;
  plan: string;
  revenue: number;
  cost: number;
  previousCost: number;
  daysElapsed: number;
  daysInPeriod: number;
  recentDailyCost: number;
  features: Breakdown[];
  models: Breakdown[];
  daily: Daily[];
  currency: string;
};
export type Dataset = {
  customers: Customer[];
  daily: Daily[];
  period: string;
  products: { id: string; name: string }[];
  events: number;
  mode: "demo" | "live";
  stripeConnected?: boolean;
  organization?: string;
  tier?: number;
  warnings?: string[];
  slackConnected?: boolean;
};
export const sum = <T>(rows: T[], f: (row: T) => number) =>
  rows.reduce((total, row) => total + f(row), 0);
export function margin(revenue: number, cost: number): number | null {
  return revenue > 0 ? ((revenue - cost) / revenue) * 100 : null;
}
export function forecast(c: Customer) {
  const remaining = Math.max(0, c.daysInPeriod - c.daysElapsed);
  const daily = c.daysElapsed > 0 ? c.recentDailyCost : 0;
  const cost = c.cost + remaining * daily;
  return {
    cost,
    margin: margin(c.revenue, cost),
    contribution: c.revenue - cost,
    daysToLoss:
      daily > 0 && c.cost < c.revenue && cost > c.revenue
        ? Math.ceil((c.revenue - c.cost) / daily)
        : null,
  };
}
export function status(c: Customer, target = 60) {
  if (c.cost > c.revenue) return "Loss-making";
  if (forecast(c).contribution < 0) return "Loss risk";
  if ((margin(c.revenue, c.cost) ?? 0) < 30) return "Critical margin";
  if ((margin(c.revenue, c.cost) ?? 0) < target) return "Below target";
  return "Healthy";
}
export function breakdown(customers: Customer[], key: "features" | "models") {
  const map = new Map<string, Breakdown>();
  for (const c of customers)
    for (const item of c[key]) {
      const row = map.get(item.name) ?? { name: item.name, cost: 0, runs: 0 };
      row.cost += item.cost;
      row.runs += item.runs;
      map.set(item.name, row);
    }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}
export function plans(customers: Customer[]) {
  return [...new Set(customers.map((c) => c.plan))]
    .map((name) => {
      const members = customers.filter((c) => c.plan === name);
      const revenue = sum(members, (c) => c.revenue),
        cost = sum(members, (c) => c.cost);
      const sorted = members.map((c) => c.cost).sort((a, b) => a - b);
      return {
        name,
        customers: members.length,
        revenue,
        cost,
        price: revenue / members.length,
        avgCost: cost / members.length,
        margin: margin(revenue, cost),
        p90: sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)] ?? 0,
      };
    })
    .sort((a, b) => a.price - b.price);
}
export function simulate(
  price: number,
  baseCost: number,
  allowance: number,
  featureShare: number,
) {
  const cost =
    baseCost * (1 - featureShare) + (baseCost * featureShare * allowance) / 100;
  return { cost, margin: margin(price, cost), contribution: price - cost };
}
export function recommendations(customers: Customer[], target = 60) {
  const result: {
    id: string;
    kind: "critical" | "warning" | "opportunity";
    title: string;
    body: string;
    customerId?: string;
  }[] = [];
  for (const c of customers) {
    const f = forecast(c);
    const top = [...c.features].sort((a, b) => b.cost - a.cost)[0];
    if (f.contribution < 0)
      result.push({
        id: c.id,
        kind: "critical",
        title: `${c.name} is projected to lose $${Math.abs(f.contribution).toFixed(0)}`,
        body: `${top?.name ?? "AI usage"} accounts for ${c.cost ? Math.round(((top?.cost ?? 0) / c.cost) * 100) : 0}% of AI spend. Review the included allowance or move this customer to a higher plan.`,
        customerId: c.id,
      });
    else if ((margin(c.revenue, c.cost) ?? 100) < 30)
      result.push({
        id: c.id,
        kind: "critical",
        title: `${c.name}'s AI margin is critically low`,
        body: `Current AI margin is ${(margin(c.revenue, c.cost) ?? 0).toFixed(1)}%, below the 30% critical threshold. Review ${top?.name ?? "AI usage"} costs and the included allowance.`,
        customerId: c.id,
      });
    else if ((margin(c.revenue, c.cost) ?? 100) < target)
      result.push({
        id: c.id,
        kind: "warning",
        title: `${c.name} is below your ${target}% target`,
        body: `Review usage limits and the cost of ${top?.name ?? "AI workflows"}.`,
        customerId: c.id,
      });
  }
  for (const p of plans(customers))
    if (p.price > 0 && p.p90 > p.price * 0.5)
      result.push({
        id: p.name,
        kind: "warning",
        title: `${p.name}'s heavy users are squeezing margins`,
        body: `The 90th-percentile AI cost is $${p.p90.toFixed(2)} per customer, ${Math.round((p.p90 / p.price) * 100)}% of average subscription revenue. Test a price or allowance change.`,
      });
  return result;
}
