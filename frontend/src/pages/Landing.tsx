import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";

const SNIPPET = `import margined
margined.init()  # MARGINED_API_KEY

response = margined.track(
    client.messages.create(...),
    user_id=current_user.id,
    feature="summarize_document",
)`;

const DEMO_ROWS = [
  { customer: "acme_corp", plan: "Scale", mrr: "$299", cost: "$14.20", margin: "95.3%", status: "ok" },
  { customer: "user_devon", plan: "Starter", mrr: "$29", cost: "$41.80", margin: "-44.1%", status: "risk" },
  { customer: "globex_ai", plan: "Growth", mrr: "$99", cost: "$8.95", margin: "91.0%", status: "ok" },
  { customer: "initech", plan: "Growth", mrr: "$99", cost: "$47.12", margin: "52.4%", status: "watch" },
];

export default function Landing() {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border/60">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-semibold tracking-tight">Margined</span>
          <nav className="flex items-center gap-6 text-sm">
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <a
              href="https://github.com/trymargined/margined"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <Link
              to="/login"
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md font-medium hover:opacity-90 transition-opacity"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            Your LLM bill knows your costs.
            <br />
            Stripe knows your revenue.
            <br />
            <span className="text-primary">Nothing connects them.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Margined is the unit-economics layer for AI SaaS. Add one argument to your
            LLM calls and see gross margin per customer, cost per feature, and the
            price you need to charge — in under five minutes.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md font-medium hover:opacity-90 transition-opacity"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-sm text-muted-foreground">
              Free up to 100K calls/month. No credit card.
            </span>
          </div>
        </div>
      </section>

      {/* Product proof: snippet + margin table */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-2 gap-6 items-start">
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 text-xs text-muted-foreground">
              One argument. That's the integration.
            </div>
            <pre className="p-5 text-[13px] leading-relaxed overflow-x-auto text-foreground/90">
              <code>{SNIPPET}</code>
            </pre>
          </div>

          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 text-xs text-muted-foreground">
              What you get back
            </div>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground text-xs">
                  <th className="text-left px-4 py-2 font-medium">Customer</th>
                  <th className="text-right px-4 py-2 font-medium">MRR</th>
                  <th className="text-right px-4 py-2 font-medium">LLM cost</th>
                  <th className="text-right px-4 py-2 font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ROWS.map((row) => (
                  <tr key={row.customer} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{row.customer}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.mrr}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.cost}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                        row.status === "risk"
                          ? "text-red-400"
                          : row.status === "watch"
                            ? "text-amber-400"
                            : "text-emerald-400"
                      }`}
                    >
                      {row.margin}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-muted-foreground border-t border-border/60">
              user_devon pays $29/mo and costs $41.80 to serve. You'd never see it in
              your provider dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/60">
        <div className="max-w-5xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-10">
          <Feature
            title="Margin per customer"
            body="LLM cost joined with Stripe MRR. Green above 70%, red when a customer costs more than they pay. Cache-aware pricing across Anthropic, OpenAI, Google, and more."
          />
          <Feature
            title="Cost per feature"
            body="Every call is tagged with a feature name. See which product surface burns 60% of your bill — and whether the revenue justifies it."
          />
          <Feature
            title="Pricing calculator"
            body="Break-even and recommended prices computed from your real p50/p90/p99 usage. Know what to charge before your margin decides for you."
          />
        </div>
      </section>

      {/* Positioning */}
      <section className="border-t border-border/60">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="max-w-2xl text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">Built for founders, not FinOps teams.</span>{" "}
            Observability tools answer "why did this trace fail?" Margined answers
            "am I making money on this customer?" — the question you actually ask
            when the invoice doubles.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/60">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="text-2xl font-bold tracking-tight mb-10">Pricing</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <PriceCard
              name="Free"
              price="$0"
              items={["100K calls/month", "1 project", "Cost per customer & feature", "Daily trend"]}
            />
            <PriceCard
              name="Starter"
              price="$49"
              highlight
              items={[
                "1M calls/month",
                "3 projects",
                "Stripe margin column",
                "Margin-at-risk alerts (email)",
              ]}
            />
            <PriceCard
              name="Growth"
              price="$149"
              items={[
                "Unlimited calls",
                "5 seats",
                "Pricing calculator",
                "Slack alerts + API access",
              ]}
            />
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Margined</span>
          <div className="flex gap-6">
            <a href="https://github.com/trymargined/margined" className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <Link to="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function PriceCard({
  name,
  price,
  items,
  highlight,
}: {
  name: string;
  price: string;
  items: string[];
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-6 ${
        highlight ? "border-primary/60 bg-primary/5" : "border-border/60"
      }`}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-semibold">{name}</h3>
        <div>
          <span className="text-2xl font-bold tabular-nums">{price}</span>
          <span className="text-sm text-muted-foreground">/mo</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>
      <Link
        to="/login"
        className={`mt-6 block text-center rounded-md px-4 py-2 text-sm font-medium transition-opacity ${
          highlight
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border hover:bg-muted"
        }`}
      >
        Get started
      </Link>
    </div>
  );
}
