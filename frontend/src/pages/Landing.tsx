import { Link } from "react-router-dom";

const STATEMENT_ROWS = [
  { customer: "platform@meridianhq.com", plan: "Scale", mrr: 299, cost: 14.2, margin: 95.3, tone: "profit" },
  { customer: "team@copperleaf.io", plan: "Growth", mrr: 99, cost: 8.95, margin: 91.0, tone: "profit" },
  { customer: "eng@fieldday.app", plan: "Growth", mrr: 99, cost: 47.12, margin: 52.4, tone: "watch" },
  { customer: "devon@solowork.co", plan: "Starter", mrr: 29, cost: 41.8, margin: -44.1, tone: "loss" },
  { customer: "ai@vantagerow.com", plan: "Scale", mrr: 299, cost: 61.33, margin: 79.5, tone: "profit" },
  { customer: "mina@papertrail.app", plan: "Starter", mrr: 29, cost: 2.11, margin: 92.7, tone: "profit" },
] as const;

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const toneClass = { profit: "text-profit", watch: "text-watch", loss: "text-loss" };

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-display text-xl italic tracking-tight">Margined</span>
          <nav className="flex items-center gap-6 text-[13px]">
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
              to="/dashboard"
              className="bg-primary text-primary-foreground px-3.5 py-1.5 rounded-md font-medium hover:opacity-90 active:scale-[0.96] transition-[opacity,scale]"
            >
              Open the demo
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-14">
        <p className="eyebrow mb-5">Unit economics for AI SaaS</p>
        <h1 className="font-display text-[44px] sm:text-[60px] leading-[1.04] tracking-[-0.02em] font-medium max-w-3xl">
          The P&L your LLM bill is&nbsp;hiding.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground max-w-xl">
          Margined joins every model call with Stripe revenue: gross margin per
          customer, cost per feature, and the price you should be charging. One
          argument in your code.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link
            to="/dashboard"
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-medium hover:opacity-90 active:scale-[0.96] transition-[opacity,scale]"
          >
            Explore the live demo
          </Link>
          <a
            href="https://github.com/trymargined/margined"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4 decoration-border"
          >
            Read the quickstart
          </a>
        </div>
        <p className="mt-6 font-mono text-[13px] text-muted-foreground">
          pip install margined · free to 100K calls/mo · 5-minute setup
        </p>
      </section>

      {/* Signature: the statement */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 border-b">
            <span className="eyebrow">Briefly, Inc. — statement of AI unit economics</span>
            <span className="eyebrow">July 2026 · prepared by Margined</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b">
                  <th className="eyebrow text-left px-5 py-2.5 font-medium">Customer</th>
                  <th className="eyebrow text-left px-3 py-2.5 font-medium">Plan</th>
                  <th className="eyebrow text-right px-3 py-2.5 font-medium">MRR</th>
                  <th className="eyebrow text-right px-3 py-2.5 font-medium">LLM cost, 30d</th>
                  <th className="eyebrow text-right px-5 py-2.5 font-medium">Gross margin</th>
                </tr>
              </thead>
              <tbody>
                {STATEMENT_ROWS.map((row, i) => (
                  <tr
                    key={row.customer}
                    className="statement-row border-b last:border-b-0 h-[38px]"
                    style={{ animationDelay: `${120 + i * 90}ms` }}
                  >
                    <td className="px-5 font-mono text-xs">{row.customer}</td>
                    <td className="px-3 text-muted-foreground">{row.plan}</td>
                    <td className="px-3 text-right figure">{usd(row.mrr)}</td>
                    <td className="px-3 text-right figure">{usd(row.cost)}</td>
                    <td className={`px-5 text-right figure font-medium ${toneClass[row.tone]}`}>
                      {row.margin.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="statement-row border-t h-[38px]" style={{ animationDelay: "680ms" }}>
                  <td className="px-5 font-medium">34 customers</td>
                  <td className="px-3" />
                  <td className="px-3 text-right figure font-medium">$3,858.00</td>
                  <td className="px-3 text-right figure font-medium">$487.20</td>
                  <td className="px-5 text-right figure font-medium">87.4%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-5 py-3 border-t text-[13px] text-muted-foreground leading-relaxed">
            devon@solowork.co costs {usd(12.8)} more to serve each month than they pay.
            Neither your provider dashboard nor Stripe will ever show you this line.
          </p>
        </div>
      </section>

      {/* How it works — ledger entries */}
      <section className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-20 grid md:grid-cols-[200px_1fr] gap-10">
          <p className="eyebrow md:pt-1">How it works</p>
          <div className="space-y-12 max-w-2xl">
            <Step
              n="Entry 1"
              title="Tag every call"
              body="Wrap your existing calls — or auto-patch the client and change nothing. Two tags do all the work: who the customer is, and which feature is running."
            >
              <pre className="mt-4 bg-card border rounded-md px-4 py-3.5 font-mono text-[13px] leading-relaxed overflow-x-auto">
{`response = margined.track(
    client.messages.create(...),
    user_id=current_user.id,
    feature="summarize_document",
)`}
              </pre>
            </Step>
            <Step
              n="Entry 2"
              title="Connect Stripe"
              body="A read-only connection maps your customers to their subscriptions. Margined normalizes every plan — monthly, yearly, seat-based — to MRR."
            />
            <Step
              n="Entry 3"
              title="Read the statement"
              body="Margin per customer, cost per feature, cost per agent run. Costs are priced from a versioned table that knows what provider caches actually bill — cache reads at a tenth of input price, Anthropic cache writes at 1.25×."
            />
          </div>
        </div>
      </section>

      {/* Claims */}
      <section className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-20 space-y-16">
          <Claim
            title="Your most expensive feature is not your most valuable one."
            body="Every call carries a feature tag, so the bill decomposes: research_agent at 61% of spend, chat at 12%. Whether the revenue justifies it stops being a feeling."
          >
            <MiniTable
              rows={[
                ["research_agent", "$312.40", "61% of bill"],
                ["meeting_summary", "$88.10", "17%"],
                ["chat_assistant", "$62.20", "12%"],
              ]}
              flagged="research_agent"
            />
          </Claim>
          <Claim
            title="Price from your p99, not your median."
            body="The calculator reads your real usage distribution per plan tier and returns break-even and recommended prices — plus the usage cap that stops your heaviest users from eating the margin."
            flip
          >
            <MiniTable
              rows={[
                ["Break-even price (median)", "$7.00", ""],
                ["Recommended for 70% margin", "$29.00", ""],
                ["Margin at p99 usage", "23%", "cap advised"],
              ]}
              flagged="Margin at p99 usage"
            />
          </Claim>
          <Claim
            title="Hear about a margin-negative customer before the invoice does."
            body="Set a threshold — say, cost above 50% of a customer's MRR — and get the email or Slack message while there's still a month to act."
          >
            <div className="bg-card border rounded-md px-4 py-3.5 font-mono text-[13px] leading-relaxed">
              <p className="text-muted-foreground">margin alert · 09:00</p>
              <p className="mt-1.5">
                devon@solowork.co is at <span className="text-loss font-medium">-44.1%</span> margin
                this month ($41.80 cost / $29 MRR).
              </p>
            </div>
          </Claim>
        </div>
      </section>

      {/* Positioning */}
      <section className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="max-w-2xl text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">Built for founders, not FinOps teams.</span>{" "}
            Observability tools answer "why did this trace fail?" Margined answers
            "am I making money on this customer?" — the question you actually ask
            when the invoice doubles.
          </p>
        </div>
      </section>

      {/* Pricing — rate card, not cards */}
      <section id="pricing" className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="eyebrow mb-3">Rate card</p>
          <h2 className="font-display text-3xl tracking-[-0.01em] font-medium mb-10">
            Pricing that would pass its own margin check.
          </h2>
          <div className="bg-card border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="eyebrow text-left px-5 py-2.5 font-medium">Plan</th>
                  <th className="eyebrow text-right px-3 py-2.5 font-medium">Per month</th>
                  <th className="eyebrow text-right px-3 py-2.5 font-medium">Calls included</th>
                  <th className="eyebrow text-left px-5 py-2.5 font-medium">Includes</th>
                </tr>
              </thead>
              <tbody>
                <PriceRow name="Free" price="$0" calls="100K" includes="Cost per customer and feature, daily trend, 1 project" />
                <PriceRow name="Starter" price="$49" calls="1M" includes="Stripe margin column, email alerts, 3 projects" strong />
                <PriceRow name="Growth" price="$149" calls="Unlimited" includes="Pricing calculator, Slack alerts, API access, 5 seats" />
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            The free tier is genuinely useful — most early AI SaaS runs under 100K calls a month.
          </p>
        </div>
      </section>

      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-[13px] text-muted-foreground">
          <span className="font-display italic text-base text-foreground">Margined</span>
          <div className="flex gap-6">
            <a href="https://github.com/trymargined/margined" className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <Link to="/dashboard" className="hover:text-foreground transition-colors">
              Live demo
            </Link>
            <Link to="/login" className="hover:text-foreground transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  children,
}: {
  n: string;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <p className="eyebrow mb-2">{n}</p>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

function Claim({
  title,
  body,
  children,
  flip,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className={`grid md:grid-cols-2 gap-8 md:gap-14 items-center ${flip ? "md:[direction:rtl]" : ""}`}>
      <div className="md:[direction:ltr]">
        <h3 className="font-display text-[26px] leading-snug tracking-[-0.01em] font-medium max-w-md">
          {title}
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground max-w-md">{body}</p>
      </div>
      <div className="md:[direction:ltr]">{children}</div>
    </div>
  );
}

function MiniTable({
  rows,
  flagged,
}: {
  rows: Array<[string, string, string]>;
  flagged?: string;
}) {
  return (
    <div className="bg-card border rounded-md overflow-hidden">
      {rows.map(([label, value, note]) => (
        <div key={label} className="flex items-center justify-between px-4 h-[38px] border-b last:border-b-0 text-[13px]">
          <span className="font-mono text-xs">{label}</span>
          <span className="flex items-baseline gap-2.5">
            {note && (
              <span className={`text-[11px] ${label === flagged ? "text-watch" : "text-muted-foreground"}`}>
                {note}
              </span>
            )}
            <span className="figure font-medium">{value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function PriceRow({
  name,
  price,
  calls,
  includes,
  strong,
}: {
  name: string;
  price: string;
  calls: string;
  includes: string;
  strong?: boolean;
}) {
  return (
    <tr className="border-b last:border-b-0 h-[46px]">
      <td className={`px-5 ${strong ? "font-semibold" : "font-medium"}`}>{name}</td>
      <td className="px-3 text-right figure font-medium">{price}</td>
      <td className="px-3 text-right figure text-muted-foreground">{calls}</td>
      <td className="px-5 text-muted-foreground text-[13px]">{includes}</td>
    </tr>
  );
}
