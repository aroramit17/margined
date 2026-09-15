import { Customer, Dataset, sum } from "./engine";
const specs: [string, string, number, number][] = [
  ["Acme", "Business", 2499, 302],
  ["Globex", "Business", 2499, 268],
  ["Linear Labs", "Business", 2499, 191],
  ["Capsule", "Business", 2499, 224],
  ["Layers", "Business", 2499, 310],
  ["Segmenta", "Business", 2499, 181],
  ["Orbit", "Business", 2499, 210],
  ["Sisyphus", "Business", 2499, 180],
  ["Quotient", "Business", 2499, 197],
  ["CloudWatch", "Business", 2499, 208],
  ["FocalPoint", "Business", 2499, 210],
  ["Northstar", "Business", 2499, 208],
  ["Initech", "Pro", 499, 282],
  ["Stark Industries", "Starter", 99, 112],
  ["Hooli", "Pro", 499, 421],
  ["Umbrella", "Pro", 499, 181],
  ["Pied Piper", "Pro", 499, 92],
  ["Vercel Studio", "Pro", 499, 103],
  ["Wayne Enterprises", "Pro", 499, 119],
  ["Massive Dynamic", "Pro", 499, 130],
  ["Soylent", "Starter", 99, 25],
  ["Wonka", "Starter", 99, 12],
  ["Aperture", "Starter", 99, 79],
  ["Monarch", "Starter", 123, 36],
];
export function demoData(product = "all"): Dataset {
  const customers: Customer[] = specs
    .filter(
      (_, i) =>
        product === "all" ||
        (product === "research" ? i % 3 !== 0 : i % 3 === 0),
    )
    .map(([name, plan, revenue, cost], i) => {
      const share =
        name === "Hooli" || name === "Aperture" ? 0.78 : 0.52 + (i % 4) * 0.06;
      const features = [
        {
          name: "Deep research",
          cost: cost * share,
          runs: Math.round((cost * share) / 0.34),
        },
        {
          name: "AI chat",
          cost: cost * 0.14,
          runs: Math.round((cost * 0.14) / 0.018),
        },
        {
          name: "Document summaries",
          cost: cost * (1 - share - 0.2),
          runs: Math.round((cost * (1 - share - 0.2)) / 0.024),
        },
        {
          name: "Report generation",
          cost: cost * 0.06,
          runs: Math.round((cost * 0.06) / 0.07),
        },
      ];
      const weights = Array.from(
        { length: 14 },
        (_, j) => 0.7 + ((i * 7 + j * 3) % 11) / 15,
      );
      const total = sum(weights, (x) => x);
      const daily = weights.map((w, j) => ({
        date: `2026-09-${String(j + 1).padStart(2, "0")}`,
        cost: (cost * w) / total,
        revenue: revenue / 30,
      }));
      return {
        id: `cus_demo_${name.toLowerCase().replaceAll(" ", "_")}`,
        name,
        email: `billing@${name.toLowerCase().replaceAll(" ", "")}.example`,
        plan,
        revenue,
        cost,
        previousCost: cost / (1 + (i % 5) * 0.13),
        daysElapsed: 14,
        daysInPeriod: 30,
        recentDailyCost: sum(daily.slice(-7), (d) => d.cost) / 7,
        features,
        models: [
          {
            name: "Claude Sonnet 4.6",
            cost: cost * 0.62,
            runs: sum(features, (f) => f.runs) * 0.34,
          },
          {
            name: "GPT-4.1",
            cost: cost * 0.29,
            runs: sum(features, (f) => f.runs) * 0.26,
          },
          {
            name: "GPT-4.1 mini",
            cost: cost * 0.09,
            runs: sum(features, (f) => f.runs) * 0.4,
          },
        ],
        daily,
        currency: "usd",
      };
    });
  return {
    customers,
    daily: Array.from({ length: 14 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      revenue: sum(customers, (c) => c.daily[i].revenue),
      cost: sum(customers, (c) => c.daily[i].cost),
    })),
    period: "Sep 1–14, 2026",
    products: [
      { id: "research", name: "Researchly" },
      { id: "assistant", name: "Writer AI" },
    ],
    events: sum(customers, (c) => sum(c.features, (f) => f.runs)),
    mode: "demo",
    organization: "Acme Studio",
    tier: 3,
    stripeConnected: false,
  };
}
