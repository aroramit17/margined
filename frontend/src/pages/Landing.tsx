import Brand from "@/components/Brand";
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

/** Accounting convention: negatives in parentheses, not minus signs. */
const marginFigure = (margin: number) =>
  margin < 0 ? `(${Math.abs(margin).toFixed(1)})%` : `${margin.toFixed(1)}%`;

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <Link to="/" aria-label="Capybara home"><Brand /></Link>
          <nav className="flex items-center gap-3 sm:gap-6 text-[13px]">
            <a href="#pricing" className="hidden sm:block text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
            <a
              href="https://github.com/aroramit17/margined"
              className="hidden sm:block text-muted-foreground hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            <Link
              to="/demo"
              className="whitespace-nowrap bg-primary text-primary-foreground px-3.5 py-1.5 rounded-md font-medium hover:opacity-90 active:scale-[0.96] transition-[opacity,scale]"
            >
              Open the demo
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-14 sm:pt-20 pb-16 grid md:grid-cols-[1.5fr_1fr] gap-10 items-center">
        <div>
          <p className="eyebrow mb-5">AI costs. Clear margins. A little more calm.</p>
          <h1 className="font-brand text-[46px] sm:text-[64px] leading-[1.04] tracking-[-0.05em] font-semibold max-w-[14ch]">
            Keep your AI margins <span className="text-primary">calm.</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground max-w-xl">
            See what each customer costs, which features eat into profit, and where
            your pricing needs attention. Capybara brings AI usage and revenue into one clear view.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link to="/demo" className="bg-primary text-primary-foreground px-5 py-3 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
              Meet your margins <span aria-hidden="true">↗</span>
            </Link>
            <a href="#how-it-works" className="link-quiet text-sm text-muted-foreground hover:text-foreground">How it works</a>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">Explore the demo with sample data. No account needed.</p>
        </div>
        <div className="capybara-habitat relative rounded-[40%_40%_24%_24%] px-8 pt-6 pb-8 text-center max-w-[340px] w-full mx-auto">
          <p className="eyebrow relative z-10">Your calm companion for AI costs</p>
          <img src="/brand/capybara-mark.png" alt="A relaxed, warm-brown capybara sitting with a gentle smile" width="1280" height="1280" className="relative z-10 w-full h-auto mt-3" fetchPriority="high" />
          <p className="relative z-10 font-brand text-sm font-semibold tracking-tight mt-2">Less guesswork. More breathing room.</p>
        </div>
      </section>

      {/* Signature: the statement */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="eyebrow">Sample data · AI customer economics</span>
              <span className="eyebrow">Illustrative month · Capybara</span>
            </div>
            <p className="units-line mt-1">(in USD; margins as a percentage of MRR)</p>
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
                      {marginFigure(row.margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="statement-row statement-total h-[40px]" style={{ animationDelay: "680ms" }}>
                  <td className="px-5">6 sample customers</td>
                  <td className="px-3" />
                  <td className="px-3 text-right figure">$854.00</td>
                  <td className="px-3 text-right figure">$175.51</td>
                  <td className="px-5 text-right figure">79.4%</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-5 py-3 border-t text-[13px] text-muted-foreground leading-relaxed">
            devon@solowork.co costs {usd(12.8)} more to serve each month than they pay.
            See the cost and revenue together to understand the difference.
          </p>
        </div>
      </section>

      {/* How it works — ledger entries */}
      <section id="how-it-works" className="border-t">
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
              body="A read-only connection maps your customers to their subscriptions. Bring supported subscription revenue alongside AI usage costs."
            />
            <Step
              n="Entry 3"
              title="Find your breathing room"
              body="Margin per customer, cost per feature, cost per agent run. Explore the demo to see how usage becomes estimated costs and customer margins."
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
            <span className="text-foreground font-medium">Built for founders building with AI.</span>{" "}
            Capybara helps you answer "am I making money on this customer?"
            with a clear view of revenue and estimated AI costs.
          </p>
        </div>
      </section>

      {/* Pricing — rate card, not cards */}
      <section id="pricing" className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <p className="eyebrow mb-3">Planned launch pricing</p>
          <h2 className="font-display text-3xl tracking-[-0.01em] font-medium mb-10">
            Pricing that would pass its own margin check.
          </h2>
          <div className="bg-card border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="eyebrow text-left px-5 py-2.5 font-medium">Plan</th>
                  <th className="eyebrow text-right px-3 py-2.5 font-medium">One time</th>
                  <th className="eyebrow text-right px-3 py-2.5 font-medium">Events / month</th>
                  <th className="eyebrow text-left px-5 py-2.5 font-medium">Includes</th>
                </tr>
              </thead>
              <tbody>
                <PriceRow name="Tier 1" price="$49" calls="10,000" includes="Customer margins, feature costs, email alerts, 1 product" />
                <PriceRow name="Tier 2" price="$59" calls="20,000" includes="Tier 1 + plan margins, pricing simulator, 3 products" strong />
                <PriceRow name="Tier 3" price="$69" calls="30,000" includes="Tier 2 + forecasting, Slack alerts, 5 products" />
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Planned one-time launch offers. Paid checkout is not available yet; the demo uses sample data.
          </p>
        </div>
      </section>

      <footer className="border-t">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-[13px] text-muted-foreground">
          <div><Brand /><p className="mt-2 text-xs">usecapybara.com</p></div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <a href="https://github.com/aroramit17/margined" className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <Link to="/demo" className="hover:text-foreground transition-colors">
              Live demo
            </Link>
            <Link to="/changelog" className="hover:text-foreground transition-colors">
              Changelog
            </Link>
            <Link to="/security" className="hover:text-foreground transition-colors">
              Security
            </Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">
              Privacy
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
