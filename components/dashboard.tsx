"use client";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  CreditCard,
  ExternalLink,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  Leaf,
  Link2,
  Loader2,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  breakdown,
  Customer,
  Dataset,
  forecast,
  margin,
  plans,
  recommendations,
  simulate,
  status,
  sum,
} from "@/lib/engine";
import { demoData } from "@/lib/demo";
const money = (n: number, d = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: d,
  }).format(n);
const percent = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
const nav = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Customers", icon: Users },
  { name: "Plans", icon: Layers3 },
  { name: "Features", icon: Zap },
  { name: "Pricing simulator", icon: FlaskConical },
];
const colors = ["#376c50", "#a6bd81", "#ceddbd", "#dbbb87"];
function Metric({
  label,
  value,
  note,
  hero = false,
}: {
  label: string;
  value: string;
  note: string;
  hero?: boolean;
}) {
  return (
    <div className={`metric ${hero ? "hero-metric" : ""}`}>
      <div className="metric-label">
        {label}
        {hero ? (
          <span className="tiny-pill">AI only</span>
        ) : (
          <ArrowUpRight size={16} />
        )}
      </div>
      <strong>{value}</strong>
      <div className="metric-note">
        {hero ? <span className="metric-dot" /> : null}
        {note}
      </div>
    </div>
  );
}
function Trend({
  data,
  small = false,
}: {
  data: Dataset["daily"];
  small?: boolean;
}) {
  return (
    <div className={small ? "trend small" : "trend"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ left: -18, right: 12, top: 10, bottom: 0 }}
        >
          <defs>
            <linearGradient
              id={small ? "sGreen" : "green"}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#a8c3a2" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#a8c3a2" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 4"
            vertical={false}
            stroke="#e8eae6"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v) =>
              new Date(v + "T00:00:00Z").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })
            }
            tick={{ fontSize: 11, fill: "#899085" }}
            axisLine={false}
            tickLine={false}
            minTickGap={45}
          />
          <YAxis
            tickFormatter={(v) =>
              v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
            }
            tick={{ fontSize: 11, fill: "#899085" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v) => money(Number(v), 2)}
            labelFormatter={(v) => String(v)}
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e7e9e4",
              fontSize: 13,
            }}
          />
          {!small && (
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue (daily equivalent)"
              stroke="#4a7956"
              strokeWidth={2.4}
              fill="url(#green)"
            />
          )}
          <Area
            type="monotone"
            dataKey="cost"
            name="AI cost"
            stroke="#bf9457"
            strokeWidth={2}
            fill={small ? "url(#sGreen)" : "#e5d1ab"}
            fillOpacity={0.16}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Dashboard() {
  const [view, setView] = useState("Overview"),
    [data, setData] = useState<Dataset>(demoData()),
    [product, setProduct] = useState("all"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All customers"),
    [sort, setSort] = useState("cost"),
    [selected, setSelected] = useState<Customer | null>(null),
    [target, setTarget] = useState(60),
    [toast, setToast] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"demo" | "live">("demo"),
    [simPlan, setSimPlan] = useState("Pro"),
    [simFeature, setSimFeature] = useState("Deep research"),
    [price, setPrice] = useState(599),
    [allowance, setAllowance] = useState(80),
    [apiKey, setApiKey] = useState(""),
    [keyProduct, setKeyProduct] = useState(""),
    [newProduct, setNewProduct] = useState(""),
    [orgName, setOrgName] = useState(""),
    [emailAlerts, setEmailAlerts] = useState(false),
    [slack, setSlack] = useState(""),
    [subscriptions, setSubscriptions] = useState<
      {
        id: string;
        customer_name: string;
        plan: string;
        product_id: string | null;
        status: string;
      }[]
    >([]),
    [keys, setKeys] = useState<
      { id: string; product_id: string; prefix: string }[]
    >([]);
  useEffect(() => {
    const saved = localStorage.getItem("inferlytic-preferences");
    if (saved) {
      try {
        const p = JSON.parse(saved);
        setTarget(p.target ?? 60);
      } catch {}
    }
    if (new URLSearchParams(location.search).get("mode") === "live")
      setMode("live");
  }, []);
  useEffect(() => {
    if (mode === "demo") {
      setData(demoData(product));
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/dashboard?product=${encodeURIComponent(product)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (active) {
          setData(d);
          setError("");
          setTarget(d.targetMargin ?? 60);
          setEmailAlerts(d.emailAlerts ?? false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setData({
            customers: [],
            daily: [],
            products: [],
            events: 0,
            period: "Current billing periods",
            mode: "live",
          });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, product]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);
  useEffect(() => {
    if (mode !== "live") return;
    const path =
      view === "Integrations"
        ? "/api/subscriptions/map"
        : view === "SDK & docs"
          ? "/api/keys"
          : null;
    if (!path) return;
    let active = true;
    fetch(path)
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw Error(result.error);
        if (active) {
          if (view === "Integrations") setSubscriptions(result);
          else setKeys(result);
        }
      })
      .catch((e) => {
        if (active) setToast(e.message);
      });
    return () => {
      active = false;
    };
  }, [mode, view]);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".customer-drawer button, .customer-drawer a, .customer-drawer input",
        ),
      );
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [selected]);
  const customers = data.customers,
    revenue = sum(customers, (c) => c.revenue),
    cost = sum(customers, (c) => c.cost),
    features = breakdown(customers, "features"),
    planRows = plans(customers),
    alerts = recommendations(customers, target),
    risks = customers.filter((c) => forecast(c).contribution < 0),
    allMargin = margin(revenue, cost),
    currentPlan = planRows.find((p) => p.name === simPlan) ?? planRows[0],
    planFeatures = breakdown(
      customers.filter((c) => c.plan === currentPlan?.name),
      "features",
    ),
    selectedFeature =
      planFeatures.find((f) => f.name === simFeature)?.name ??
      planFeatures[0]?.name ??
      "No tagged usage",
    simShare = currentPlan
      ? sum(
          customers.filter((c) => c.plan === currentPlan.name),
          (c) => c.features.find((f) => f.name === selectedFeature)?.cost ?? 0,
        ) / Math.max(currentPlan.cost, 0.01)
      : 0,
    simulation = simulate(
      price,
      currentPlan?.avgCost ?? 0,
      allowance,
      simShare,
    );
  const visible = customers
    .filter(
      (c) =>
        `${c.name} ${c.email} ${c.plan}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "All customers" ||
          (filter === "Profitable" && c.revenue > c.cost) ||
          (filter === "Below target" &&
            (margin(c.revenue, c.cost) ?? 0) < target) ||
          (filter === "Projected loss" && forecast(c).contribution < 0)),
    )
    .sort((a, b) =>
      sort === "growth"
        ? b.cost / Math.max(b.previousCost, 0.01) -
          a.cost / Math.max(a.previousCost, 0.01)
        : sort === "margin"
          ? (margin(a.revenue, a.cost) ?? 0) - (margin(b.revenue, b.cost) ?? 0)
          : b.cost - a.cost,
    );
  async function mutate(path: string, body: unknown) {
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error ?? "Something went wrong");
    return result;
  }
  async function action(fn: () => Promise<void>) {
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }
  function exportCsv() {
    const cell = (v: unknown) => {
      let value = String(v);
      if (typeof v === "string" && /^[=+\-@\t\r]/.test(value))
        value = "'" + value;
      return `"${value.replaceAll('"', '""')}"`;
    };
    const text = [
      [
        "Customer",
        "Plan",
        "Revenue USD",
        "AI cost USD",
        "Margin %",
        "Projected cost USD",
      ],
      ...visible.map((c) => [
        c.name,
        c.plan,
        c.revenue,
        c.cost,
        margin(c.revenue, c.cost)?.toFixed(2) ?? "",
        forecast(c).cost.toFixed(2),
      ]),
    ]
      .map((r) => r.map(cell).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "inferlytic-customers.csv";
    a.click();
    URL.revokeObjectURL(url);
    setToast("Customer report exported");
  }
  function table(rows: Customer[], compact = false) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Plan</th>
              <th className="number">Revenue</th>
              <th className="number">AI cost</th>
              <th className="number">AI margin</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id} onClick={() => setSelected(c)}>
                <td>
                  <button
                    className="customer-link"
                    onClick={() => setSelected(c)}
                  >
                    <span className={`avatar a${i % 5}`}>
                      {c.name.slice(0, 1)}
                    </span>
                    <span>
                      {c.name}
                      {!compact && <small>{c.email}</small>}
                    </span>
                  </button>
                </td>
                <td>
                  <span className="plan-label">{c.plan}</span>
                </td>
                <td className="number">{money(c.revenue)}</td>
                <td className="number">{money(c.cost, 2)}</td>
                <td
                  className={`number margin-value ${c.cost > c.revenue ? "negative" : ""}`}
                >
                  {percent(margin(c.revenue, c.cost))}
                  <span className="mini-track">
                    <i
                      style={{
                        width: `${Math.max(0, margin(c.revenue, c.cost) ?? 0)}%`,
                      }}
                    />
                  </span>
                </td>
                <td>
                  <span
                    className={`status ${status(c, target) === "Healthy" ? "healthy" : status(c, target) === "Below target" ? "warning" : "danger"}`}
                  >
                    <i />
                    {status(c, target)}
                  </span>
                </td>
                <td>
                  <ChevronRight size={15} color="#9b9f96" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <Search />
            <h3>No customers found</h3>
            <p>
              {mode === "live"
                ? "Connect Stripe and send your first usage event to see customer economics."
                : "Try a different name or filter."}
            </p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <BarChart3 size={22} />
          </span>
          inferlytic<span className="brand-period">.</span>
        </a>
        <button className="workspace" onClick={() => setView("Settings")}>
          <span className="workspace-avatar">A</span>
          <span>
            {data.organization ?? "Your workspace"}
            <small>
              {mode === "demo" ? "Demo workspace" : "Company workspace"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.name}
              onClick={() => setView(n.name)}
              className={view === n.name ? "active" : ""}
            >
              <n.icon size={18} />
              {n.name}
              {n.name === "Pricing simulator" && (
                <span className="new-label">NEW</span>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-caption manage">MANAGE</div>
        <nav>
          <button
            onClick={() => setView("Alerts")}
            className={view === "Alerts" ? "active" : ""}
          >
            <Bell size={18} />
            Alerts<span className="count-badge">{alerts.length}</span>
          </button>
          <button
            onClick={() => setView("Integrations")}
            className={view === "Integrations" ? "active" : ""}
          >
            <Link2 size={18} />
            Integrations
          </button>
          <button
            onClick={() => setView("Settings")}
            className={view === "Settings" ? "active" : ""}
          >
            <Settings2 size={18} />
            Settings
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="tier-box">
            <div>
              <Sparkles size={15} />
              <strong>
                {mode === "demo" ? "Explore the full picture" : "Private beta"}
              </strong>
            </div>
            <p>
              {mode === "demo"
                ? "You’re viewing a sample AI business. Make it yours when you’re ready."
                : "Your margins, with room to grow."}
            </p>
            <button onClick={() => setView("Integrations")}>
              {mode === "demo" ? "Connect your business" : "Manage connections"}
              <ArrowRight size={15} />
            </button>
          </div>
          <button className="docs-link" onClick={() => setView("SDK & docs")}>
            <BookOpen size={17} />
            SDK & documentation
            <ArrowUpRight size={15} />
          </button>
          <div className="profile">
            <span className="profile-avatar">AA</span>
            <div>
              Amit’s workspace<small>Founder</small>
            </div>
            <button
              title={mode === "demo" ? "Sign in" : "Sign out"}
              onClick={() =>
                action(async () => {
                  if (mode === "live") await mutate("/api/auth/signout", {});
                  location.href = "/login";
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{view}</span>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span />
              {data.mode === "demo" ? "Demo data" : "Live workspace"}
            </span>
            <button
              title="View alerts"
              className="icon-button"
              onClick={() => setView("Alerts")}
            >
              <Bell size={18} />
              {alerts.length > 0 && <i />}
            </button>
            <span className="profile-avatar small-avatar">AA</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR BUSINESS, BY THE NUMBERS</div>
              <h1>
                {view === "Overview"
                  ? "A clearer view of your AI margins."
                  : view === "Customers"
                    ? "Every customer. The full picture."
                    : view === "Plans"
                      ? "Good pricing starts here."
                      : view === "Features"
                        ? "Know what every feature costs."
                        : view === "Pricing simulator"
                          ? "Find your pricing sweet spot."
                          : view === "Alerts"
                            ? "Stay ahead of your margins."
                            : view === "Integrations"
                              ? "Connect the dots."
                              : view === "Settings"
                                ? "Make it your workspace."
                                : "A few lines. A lot of clarity."}
              </h1>
              <p>
                {view === "Overview"
                  ? "Understand what you earn, what AI costs, and where to act."
                  : view === "Customers"
                    ? "See who’s profitable today — and who might not be tomorrow."
                    : view === "Plans"
                      ? "Compare contribution, cost, and the customers behind each plan."
                      : view === "Features"
                        ? "Follow your AI spend from a request to a product decision."
                        : view === "Pricing simulator"
                          ? "Explore price and usage changes before making a commitment."
                          : view === "Alerts"
                            ? "Deterministic signals. Practical next steps. No guesswork."
                            : view === "Integrations"
                              ? "Bring your revenue and AI usage together in one place."
                              : view === "Settings"
                                ? "Manage products, margin targets, and notification preferences."
                                : "Instrument your Node.js app without sending prompts or responses."}
              </p>
            </div>
            {["Overview", "Customers", "Plans", "Features"].includes(view) && (
              <div className="heading-controls">
                <label className="select-wrap">
                  <Layers3 size={15} />
                  <select
                    aria-label="Product"
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                  >
                    <option value="all">All products</option>
                    {data.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="period-chip">{data.period}</span>
              </div>
            )}
          </div>
          {data.warnings && data.warnings.length > 0 && (
            <div className="error-banner">
              <strong>{data.warnings.length} subscriptions need review.</strong>
              <p>
                Some billing formats are not supported in this beta. Their
                revenue is excluded.
              </p>
              <details>
                <summary>View sync warnings</summary>
                {data.warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </details>
            </div>
          )}
          {error && (
            <div className="error-banner">
              {error} <a href="/login">Sign in</a> or{" "}
              <button onClick={() => setMode("demo")}>explore the demo</button>.
            </div>
          )}
          {loading && (
            <div className="loading-line">
              <Loader2 size={15} className="spin" />
              Loading your workspace…
            </div>
          )}
          {view === "Overview" && (
            <>
              <div className="metrics">
                <Metric
                  hero
                  label="AI contribution margin"
                  value={percent(allMargin)}
                  note="Based on usage to date"
                />
                <Metric
                  label="Subscription revenue"
                  value={money(revenue)}
                  note={`${customers.length} active customers · USD`}
                />
                <Metric
                  label="AI cost"
                  value={money(cost)}
                  note="Estimated provider costs this period"
                />
                <Metric
                  label="AI contribution"
                  value={money(revenue - cost)}
                  note="Revenue less AI costs to date"
                />
              </div>
              <div className="overview-middle">
                <section className="panel chart-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Revenue & AI spend</h2>
                      <p>Your unit economics, day by day</p>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i />
                        Revenue¹
                      </span>
                      <span>
                        <i />
                        AI cost
                      </span>
                    </div>
                  </div>
                  <Trend data={data.daily} />
                  <div className="chart-foot">
                    <ShieldCheck size={14} />
                    AI costs only. Other operating costs aren’t included.
                    <span>¹ Daily subscription equivalent</span>
                  </div>
                </section>
                <section className="panel attention-panel">
                  <div className="panel-heading">
                    <h2>Needs attention</h2>
                    <span className="count-badge">{alerts.length}</span>
                  </div>
                  <div className="attention-row">
                    <span className="attention-icon red">
                      <TriangleAlert size={18} />
                    </span>
                    <div>
                      <h3>{risks.length} customers at risk</h3>
                      <p>
                        Projected to spend more on AI than their subscription
                        revenue.
                      </p>
                      <button
                        onClick={() => {
                          setFilter("Projected loss");
                          setQuery("");
                          setView("Customers");
                        }}
                      >
                        Review customers <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="attention-row">
                    <span className="attention-icon amber">
                      <Layers3 size={18} />
                    </span>
                    <div>
                      <h3>
                        {[...planRows].sort(
                          (a, b) => (a.margin ?? 0) - (b.margin ?? 0),
                        )[0]?.name ?? "Your plans"}{" "}
                        has the lowest margin
                      </h3>
                      <p>
                        See which customers are driving costs within this plan.
                      </p>
                      <button onClick={() => setView("Plans")}>
                        Explore plan economics <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="attention-row">
                    <span className="attention-icon green">
                      <Sparkles size={18} />
                    </span>
                    <div>
                      <h3>A little change. More margin.</h3>
                      <p>Model a new price or a lower research allowance.</p>
                      <button onClick={() => setView("Pricing simulator")}>
                        Try the simulator <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                </section>
              </div>
              <section className="panel customer-panel">
                <div className="panel-heading">
                  <div>
                    <h2>
                      Customers to keep an eye on{" "}
                      <span className="subtle-count">{risks.length}</span>
                    </h2>
                    <p>Sorted by projected contribution, lowest first</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setView("Customers")}
                  >
                    View all customers <ArrowRight size={15} />
                  </button>
                </div>
                {table(
                  [...customers]
                    .sort(
                      (a, b) =>
                        forecast(a).contribution - forecast(b).contribution,
                    )
                    .slice(0, 4),
                  true,
                )}
              </section>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Where your AI spend goes</h2>
                    <button
                      className="text-button"
                      onClick={() => setView("Features")}
                    >
                      View features
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="spend-bar">
                    {features.map((f, i) => (
                      <div
                        key={f.name}
                        style={{
                          width: `${(f.cost / Math.max(cost, 1)) * 100}%`,
                          background: colors[i % 4],
                        }}
                        title={`${f.name}: ${money(f.cost)}`}
                      />
                    ))}
                  </div>
                  <div className="feature-legend">
                    {features.map((f, i) => (
                      <div key={f.name}>
                        <i style={{ background: colors[i % 4] }} />
                        <span>{f.name}</span>
                        <strong>
                          {cost ? Math.round((f.cost / cost) * 100) : 0}%
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="insight-card">
                  <Leaf size={25} />
                  <div>
                    <span className="eyebrow">
                      A MORE SUSTAINABLE AI BUSINESS
                    </span>
                    <h2>
                      Grow revenue.
                      <br />
                      Keep your margin.
                    </h2>
                    <p>
                      Start with the feature driving your spend. Test an
                      allowance change to see the impact.
                    </p>
                    <button onClick={() => setView("Pricing simulator")}>
                      Explore a pricing change <ArrowUpRight size={16} />
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
          {view === "Customers" && (
            <>
              <div className="summary-strip">
                <span>
                  <strong>{customers.length}</strong> customers
                </span>
                <span>
                  <strong className="green-text">
                    {
                      customers.filter((c) => status(c, target) === "Healthy")
                        .length
                    }
                  </strong>{" "}
                  healthy
                </span>
                <span>
                  <strong className="red-text">{risks.length}</strong> projected
                  loss
                </span>
                <button className="secondary" onClick={exportCsv}>
                  <ArrowDownToLine size={15} />
                  Export CSV
                </button>
              </div>
              <section className="panel">
                <div className="table-toolbar">
                  <div className="filter-tabs">
                    {[
                      "All customers",
                      "Profitable",
                      "Below target",
                      "Projected loss",
                    ].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "selected" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="search-wrap">
                    <Search size={15} />
                    <input
                      aria-label="Search customers"
                      placeholder="Search customers…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label="Sort customers"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="cost">Highest spend</option>
                    <option value="growth">Highest cost growth</option>
                    <option value="margin">Lowest margin</option>
                  </select>
                </div>
                {table(visible)}
                <div className="table-footer">
                  {visible.length} of {customers.length} customers
                  <span>
                    Revenue and costs reflect each customer’s current billing
                    period.
                  </span>
                </div>
              </section>
            </>
          )}
          {view === "Plans" && (
            <>
              <div className="plan-grid">
                {planRows.map((p, i) => (
                  <section className="panel plan-card" key={p.name}>
                    <span className="plan-label">{p.name}</span>
                    <h2>
                      {money(p.price)}
                      <small> / customer</small>
                    </h2>
                    <p>{p.customers} active customers</p>
                    <div className="plan-margin">
                      <strong>{percent(p.margin)}</strong>
                      <span>AI contribution margin</span>
                    </div>
                    <div className="wide-track">
                      <i
                        style={{
                          width: `${Math.max(0, p.margin ?? 0)}%`,
                          background: colors[i],
                        }}
                      />
                    </div>
                    <dl>
                      <div>
                        <dt>Subscription revenue</dt>
                        <dd>{money(p.revenue)}</dd>
                      </div>
                      <div>
                        <dt>Average AI cost</dt>
                        <dd>{money(p.avgCost, 2)}</dd>
                      </div>
                      <div>
                        <dt>90th percentile cost</dt>
                        <dd>{money(p.p90, 2)}</dd>
                      </div>
                      <div>
                        <dt>AI contribution</dt>
                        <dd>{money(p.revenue - p.cost)}</dd>
                      </div>
                    </dl>
                    <button
                      className="secondary full"
                      onClick={() => {
                        setSimPlan(p.name);
                        setPrice(Math.round(p.price));
                        setView("Pricing simulator");
                      }}
                    >
                      Simulate a change
                      <FlaskConical size={16} />
                    </button>
                  </section>
                ))}
              </div>
              <div className="info-callout">
                <Sparkles size={22} />
                <div>
                  <h3>Watch the customers at the edges.</h3>
                  <p>
                    Average margins can hide heavy users. Compare the
                    90th-percentile AI cost against the price before increasing
                    included usage.
                  </p>
                </div>
              </div>
            </>
          )}
          {view === "Features" && (
            <>
              <div className="metrics three">
                <Metric
                  label="Total AI spend"
                  value={money(cost, 2)}
                  note="Across tagged product features"
                />
                <Metric
                  label="Feature executions"
                  value={Math.round(
                    sum(features, (f) => f.runs),
                  ).toLocaleString()}
                  note="One tracked provider request per execution"
                />
                <Metric
                  hero
                  label="Largest cost driver"
                  value={features[0]?.name ?? "No usage yet"}
                  note={`${cost ? Math.round((features[0].cost / cost) * 100) : 0}% of total AI spend`}
                />
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Feature economics</h2>
                    <p>Cost attribution from your SDK feature tags</p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th className="number">Executions</th>
                        <th className="number">AI cost</th>
                        <th className="number">Cost / run</th>
                        <th>Share of spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {features.map((f, i) => (
                        <tr key={f.name}>
                          <td>
                            <span className="feature-name">
                              <span className="feature-icon">
                                <Zap size={16} />
                              </span>
                              {f.name}
                            </span>
                          </td>
                          <td className="number">
                            {Math.round(f.runs).toLocaleString()}
                          </td>
                          <td className="number">{money(f.cost, 2)}</td>
                          <td className="number">
                            {money(f.cost / Math.max(f.runs, 1), 3)}
                          </td>
                          <td>
                            <div className="feature-share">
                              <div className="wide-track">
                                <i
                                  style={{
                                    width: `${(f.cost / Math.max(cost, 1)) * 100}%`,
                                    background: colors[i % 4],
                                  }}
                                />
                              </div>
                              <strong>
                                {Math.round((f.cost / Math.max(cost, 1)) * 100)}
                                %
                              </strong>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel model-panel">
                <div className="panel-heading">
                  <h2>Model cost breakdown</h2>
                </div>
                {breakdown(customers, "models").map((m, i) => (
                  <div className="model-row" key={m.name}>
                    <span className="model-symbol">{i === 0 ? "✳" : "◈"}</span>
                    <div>
                      <strong>{m.name}</strong>
                      <small>
                        {Math.round(m.runs).toLocaleString()} requests
                      </small>
                    </div>
                    <div className="wide-track">
                      <i
                        style={{
                          width: `${(m.cost / Math.max(cost, 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{money(m.cost, 2)}</strong>
                  </div>
                ))}
              </section>
            </>
          )}
          {view === "Pricing simulator" && (
            <div className="simulator-grid">
              <section className="panel simulator-inputs">
                <div className="panel-heading">
                  <h2>What would you change?</h2>
                  <FlaskConical size={20} />
                </div>
                <label>
                  Pricing plan
                  <select
                    value={currentPlan?.name ?? ""}
                    onChange={(e) => {
                      setSimPlan(e.target.value);
                      setPrice(
                        Math.round(
                          planRows.find((p) => p.name === e.target.value)
                            ?.price ?? 0,
                        ),
                      );
                    }}
                  >
                    {planRows.map((p) => (
                      <option key={p.name}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <div className="sim-baseline">
                  <span>
                    Current price
                    <strong>{money(currentPlan?.price ?? 0)}</strong>
                  </span>
                  <span>
                    Avg. AI cost
                    <strong>{money(currentPlan?.avgCost ?? 0, 2)}</strong>
                  </span>
                  <span>
                    Current margin
                    <strong>{percent(currentPlan?.margin ?? null)}</strong>
                  </span>
                </div>
                <label>
                  New subscription price
                  <div className="price-input">
                    <span>$</span>
                    <input
                      type="number"
                      min="0"
                      max="100000"
                      aria-label="New subscription price"
                      value={price}
                      onChange={(e) =>
                        setPrice(Math.max(0, Number(e.target.value)))
                      }
                    />
                    <span>/ month</span>
                  </div>
                </label>
                <label>
                  Feature allowance to simulate
                  <select
                    aria-label="Simulation feature"
                    value={selectedFeature}
                    onChange={(e) => setSimFeature(e.target.value)}
                  >
                    {planFeatures.map((f) => (
                      <option key={f.name}>{f.name}</option>
                    ))}
                  </select>
                </label>
                <label className="range-label">
                  {selectedFeature} allowance{" "}
                  <strong>{allowance}% of current</strong>
                  <input
                    aria-label="Feature allowance"
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    value={allowance}
                    onChange={(e) => setAllowance(Number(e.target.value))}
                  />
                  <span>
                    <small>0%</small>
                    <small>100%</small>
                    <small>200%</small>
                  </span>
                </label>
                <p className="fine-print">
                  Assumes the selected feature’s cost changes in proportion to
                  the allowance. Other AI costs stay constant. This estimates
                  the impact on observed usage, and does not model churn or
                  demand changes.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    setPrice(Math.round(currentPlan?.price ?? 0));
                    setAllowance(100);
                  }}
                >
                  Reset to current pricing
                </button>
              </section>
              <section className="simulator-result">
                <span className="eyebrow">YOUR WHAT-IF SCENARIO</span>
                <h2>Room for a healthier margin.</h2>
                <div className="giant-margin">{percent(simulation.margin)}</div>
                <p>Estimated AI contribution margin</p>
                <div className="improvement">
                  <ArrowUpRight size={16} />
                  {(
                    (simulation.margin ?? 0) - (currentPlan?.margin ?? 0)
                  ).toFixed(1)}{" "}
                  percentage point change
                </div>
                <dl>
                  <div>
                    <dt>Estimated AI cost / customer</dt>
                    <dd>{money(simulation.cost, 2)}</dd>
                  </div>
                  <div>
                    <dt>Contribution / customer</dt>
                    <dd>{money(simulation.contribution, 2)}</dd>
                  </div>
                  <div>
                    <dt>Plan contribution</dt>
                    <dd>
                      {money(
                        simulation.contribution * (currentPlan?.customers ?? 0),
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="sim-note">
                  <FlaskConical size={17} />A simulation only. Your billing and
                  usage limits won’t change.
                </div>
              </section>
            </div>
          )}
          {view === "Alerts" && (
            <>
              <div className="summary-strip">
                <span>
                  <strong>{alerts.length}</strong> signals to review
                </span>
                <label className="inline-target">
                  Target margin
                  <input
                    aria-label="Target margin"
                    type="number"
                    min="0"
                    max="100"
                    value={target}
                    onChange={(e) =>
                      setTarget(
                        Math.min(100, Math.max(0, Number(e.target.value))),
                      )
                    }
                  />
                  %
                </label>
                <button
                  className="secondary"
                  onClick={() => setView("Settings")}
                >
                  <Settings2 size={15} />
                  Notification settings
                </button>
              </div>
              <div className="alert-list">
                {alerts.map((a) => (
                  <section className="panel alert-card" key={a.id}>
                    <span
                      className={`attention-icon ${a.kind === "critical" ? "red" : "amber"}`}
                    >
                      <TriangleAlert size={20} />
                    </span>
                    <div>
                      <span
                        className={`status ${a.kind === "critical" ? "danger" : "warning"}`}
                      >
                        {a.kind === "critical"
                          ? "Critical"
                          : "Below target / plan risk"}
                      </span>
                      <h2>{a.title}</h2>
                      <p>{a.body}</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        a.customerId
                          ? setSelected(
                              customers.find((c) => c.id === a.customerId)!,
                            )
                          : setView("Pricing simulator")
                      }
                    >
                      Review
                      <ArrowRight size={15} />
                    </button>
                  </section>
                ))}
                {!alerts.length && (
                  <section className="panel empty">
                    <ShieldCheck />
                    <h2>You’re in a good place.</h2>
                    <p>No customers are below your current thresholds.</p>
                  </section>
                )}
              </div>
            </>
          )}
          {view === "Integrations" && (
            <>
              <div className="demo-banner">
                <span className="attention-icon green">
                  <Link2 size={19} />
                </span>
                <div>
                  <strong>
                    {mode === "demo"
                      ? "Your sample workspace is ready to explore."
                      : "Your live workspace"}
                  </strong>
                  <p>
                    {mode === "demo"
                      ? "Connect your accounts to replace this example with your own economics."
                      : "Data is scoped to your signed-in organization."}
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => setMode(mode === "demo" ? "live" : "demo")}
                >
                  {mode === "demo" ? "Switch to live workspace" : "View demo"}
                </button>
              </div>
              <div className="integration-grid">
                {[
                  {
                    name: "Stripe",
                    icon: "S",
                    text: "Import customers, subscriptions, and recurring revenue.",
                    button: data.stripeConnected
                      ? "Sync subscriptions"
                      : "Connect Stripe",
                  },
                  {
                    name: "OpenAI",
                    icon: "◈",
                    text: "Track model usage and estimated cost from your Node.js app.",
                    button: "Set up the SDK",
                  },
                  {
                    name: "Anthropic",
                    icon: "✳",
                    text: "Attribute Claude input, output, and cached tokens to customers.",
                    button: "Set up the SDK",
                  },
                ].map((p) => (
                  <section className="panel integration-card" key={p.name}>
                    <div className={`provider-logo ${p.name.toLowerCase()}`}>
                      {p.icon}
                    </div>
                    <span className="status neutral">
                      {p.name === "Stripe" && data.stripeConnected
                        ? "Connected"
                        : "Setup required"}
                    </span>
                    <h2>{p.name}</h2>
                    <p>{p.text}</p>
                    <button
                      className="secondary full"
                      onClick={() =>
                        p.name === "Stripe"
                          ? action(async () => {
                              if (mode === "demo") {
                                setToast(
                                  "Sign in to a configured live workspace to connect Stripe.",
                                );
                                return;
                              }
                              if (data.stripeConnected) {
                                const result = await mutate(
                                  "/api/stripe/sync",
                                  {},
                                );
                                setToast(
                                  `${result.synced} subscriptions synced${result.warnings.length ? `; ${result.warnings.length} need review` : ""}`,
                                );
                                const response = await fetch("/api/dashboard");
                                if (!response.ok)
                                  throw Error("Unable to refresh dashboard");
                                setData(await response.json());
                                setProduct("all");
                              } else location.href = "/api/stripe/connect";
                            })
                          : setView("SDK & docs")
                      }
                    >
                      {p.button}
                      <ArrowUpRight size={15} />
                    </button>
                  </section>
                ))}
              </div>
              <section className="panel setup-guide">
                <h2>Your first margin, in three steps.</h2>
                <div>
                  <span>01</span>
                  <p>
                    <strong>Connect your revenue</strong>Authorize a read-only
                    Stripe connection.
                  </p>
                  <span>02</span>
                  <p>
                    <strong>Install the Node SDK</strong>Wrap your OpenAI or
                    Anthropic client.
                  </p>
                  <span>03</span>
                  <p>
                    <strong>Identify your customers</strong>Use Stripe customer
                    IDs to join usage to revenue.
                  </p>
                </div>
              </section>
              {mode === "live" && subscriptions.length > 0 && (
                <section className="panel mapping-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Map revenue to a product</h2>
                      <p>
                        Choose the app each subscription pays for. All-products
                        totals include unmapped subscriptions.
                      </p>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Plan</th>
                          <th>Product</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subscriptions.map((s) => (
                          <tr key={s.id}>
                            <td>{s.customer_name}</td>
                            <td>{s.plan}</td>
                            <td>
                              <select
                                aria-label={`Product for ${s.customer_name}`}
                                value={s.product_id ?? ""}
                                disabled={loading}
                                onChange={(e) => {
                                  const productId = e.target.value;
                                  if (!productId) return;
                                  action(async () => {
                                    await mutate("/api/subscriptions/map", {
                                      subscriptionId: s.id,
                                      productId,
                                    });
                                    setSubscriptions((current) =>
                                      current.map((x) =>
                                        x.id === s.id
                                          ? { ...x, product_id: productId }
                                          : x,
                                      ),
                                    );
                                    setToast("Subscription mapped to product");
                                  });
                                }}
                              >
                                <option value="">Unmapped</option>
                                {data.products.map((p) => (
                                  <option value={p.id} key={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <div className="info-callout">
                <ShieldCheck size={20} />
                <p>
                  Inferlytic records token counts and feature tags. Prompt and
                  response content stays in your application.
                </p>
              </div>
            </>
          )}
          {view === "Settings" && (
            <div className="settings-grid">
              <section className="panel settings-card">
                <h2>Workspace preferences</h2>
                <label>
                  Company name
                  <input
                    placeholder={data.organization ?? "Your company"}
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </label>
                <label>
                  Target AI margin (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={target}
                    onChange={(e) =>
                      setTarget(
                        Math.min(100, Math.max(0, Number(e.target.value))),
                      )
                    }
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                  />
                  Email me when a customer needs attention
                </label>
                <label>
                  Slack incoming webhook{" "}
                  <span className="tiny-pill">Tier 3</span>
                  <input
                    type="password"
                    placeholder="https://hooks.slack.com/services/…"
                    value={slack}
                    onChange={(e) => setSlack(e.target.value)}
                  />
                </label>
                {mode === "live" && data.slackConnected && (
                  <button
                    className="text-button"
                    onClick={() =>
                      action(async () => {
                        await mutate("/api/settings", {
                          targetMargin: target,
                          emailAlerts,
                          slackWebhook: null,
                        });
                        setData({ ...data, slackConnected: false });
                        setSlack("");
                        setToast("Slack alerts disconnected");
                      })
                    }
                  >
                    Disconnect Slack alerts
                  </button>
                )}
                <button
                  className="primary"
                  disabled={loading}
                  onClick={() =>
                    action(async () => {
                      if (mode === "demo") {
                        localStorage.setItem(
                          "inferlytic-preferences",
                          JSON.stringify({ target }),
                        );
                        setToast(
                          "Demo margin target saved on this device. Notifications require live setup.",
                        );
                      } else {
                        await mutate("/api/settings", {
                          targetMargin: target,
                          name: orgName || undefined,
                          emailAlerts,
                          slackWebhook: slack || undefined,
                        });
                        setToast("Workspace preferences saved");
                      }
                    })
                  }
                >
                  Save preferences
                  <Check size={16} />
                </button>
              </section>
              <section className="panel settings-card">
                <h2>Your products</h2>
                <p>Keep each app’s economics separate.</p>
                {data.products.map((p) => (
                  <div className="product-row" key={p.id}>
                    <Layers3 size={18} />
                    <strong>{p.name}</strong>
                    <span className="status neutral">Active</span>
                  </div>
                ))}
                <label>
                  New product name
                  <input
                    value={newProduct}
                    onChange={(e) => setNewProduct(e.target.value)}
                    placeholder="e.g. Researchly"
                    maxLength={80}
                  />
                </label>
                <button
                  className="secondary"
                  disabled={!newProduct.trim() || loading}
                  onClick={() =>
                    action(async () => {
                      if (mode === "demo") {
                        setToast(
                          "Product creation is available in a signed-in live workspace.",
                        );
                        return;
                      }
                      const p = await mutate("/api/products", {
                        name: newProduct,
                      });
                      setData({ ...data, products: [...data.products, p] });
                      setNewProduct("");
                      setToast("Product created");
                    })
                  }
                >
                  <Plus size={16} />
                  Add product
                </button>
                <div className="plan-details">
                  <h3>Lifetime tiers</h3>
                  <p>
                    Tier 1: 1 product · 10K events / month
                    <br />
                    Tier 2: 3 products · 20K events / month
                    <br />
                    Tier 3: 5 products · 30K events / month
                  </p>
                  <small>
                    One-time checkout requires Stripe configuration. Recurring
                    overages are not enabled.
                  </small>
                  <div className="tier-buttons">
                    {[1, 2, 3].map((t) => (
                      <button
                        className="secondary"
                        key={t}
                        onClick={() =>
                          action(async () => {
                            if (mode === "demo") {
                              setToast(
                                "Sign in to a live workspace to purchase a lifetime tier.",
                              );
                              return;
                            }
                            const result = await mutate(
                              "/api/billing/checkout",
                              { tier: t },
                            );
                            if (result.url) location.href = result.url;
                          })
                        }
                      >
                        Tier {t} · ${[49, 59, 69][t - 1]}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
          {view === "SDK & docs" && (
            <div className="docs-grid">
              <section className="panel docs-card">
                <span className="step-number">01</span>
                <h2>Install the Node.js SDK</h2>
                <p>
                  The SDK is included in this repository. Build and install the
                  local package during private beta.
                </p>
                <pre>
                  npm run sdk:build{"\n"}cd your-app{"\n"}npm install
                  /path/to/inferlytic/packages/sdk
                </pre>
                <span className="step-number">02</span>
                <h2>Wrap your provider, then identify the customer</h2>
                <p>
                  Request context stays isolated across concurrent requests.
                </p>
                <pre>{`import OpenAI from 'openai';\nimport { Inferlytic } from '@inferlytic/sdk';\n\nconst telemetry = new Inferlytic({\n  apiKey: process.env.INFERLYTIC_KEY!,\n  endpoint: 'http://localhost:3000/api/v1/events'\n});\nconst openai = telemetry.wrapOpenAI(new OpenAI());\n\nawait telemetry.withCustomer({\n  customerId: 'cus_your_stripe_customer',\n  userId: user.id,\n  feature: 'Deep research'\n}, async () => {\n  return openai.chat.completions.create({\n    model: 'gpt-4.1-mini',\n    messages: [{ role: 'user', content: 'Hello' }]\n  });\n});\nawait telemetry.flush();`}</pre>
                <p>
                  Use <code>wrapAnthropic(client)</code> for Claude Messages or{" "}
                  <code>track(event)</code> for explicit usage. Streaming is
                  currently unsupported and is rejected before a provider
                  request is sent.
                </p>
              </section>
              <section className="panel docs-card">
                <Code2 size={25} />
                <h2>Create a product key</h2>
                <p>Keys belong on your server. The full key is shown once.</p>
                <label>
                  Product
                  <select
                    value={keyProduct}
                    onChange={(e) => setKeyProduct(e.target.value)}
                  >
                    <option value="">Choose a product</option>
                    {data.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={!keyProduct || loading}
                  onClick={() =>
                    action(async () => {
                      if (mode === "demo") {
                        setToast(
                          "Sign in to a live workspace to create a real API key.",
                        );
                        return;
                      }
                      const r = await mutate("/api/keys", {
                        productId: keyProduct,
                      });
                      setApiKey(r.key);
                      const response = await fetch("/api/keys");
                      if (response.ok) setKeys(await response.json());
                    })
                  }
                >
                  Create API key
                  <Plus size={16} />
                </button>
                {apiKey && (
                  <div className="key-result">
                    <code>{apiKey}</code>
                    <button
                      className="secondary"
                      onClick={() =>
                        action(async () => {
                          await navigator.clipboard.writeText(apiKey);
                          setToast("Key copied");
                        })
                      }
                    >
                      Copy key
                    </button>
                  </div>
                )}
                {mode === "live" && keys.length > 0 && (
                  <div className="key-list">
                    <h3>Active keys</h3>
                    {keys.map((k) => (
                      <div className="product-row" key={k.id}>
                        <code>{k.prefix}…</code>
                        <button
                          className="text-button"
                          onClick={() =>
                            action(async () => {
                              const response = await fetch("/api/keys", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: k.id }),
                              });
                              if (!response.ok)
                                throw Error("Could not revoke key");
                              setKeys((current) =>
                                current.filter((x) => x.id !== k.id),
                              );
                              setApiKey("");
                              setToast("API key revoked");
                            })
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="docs-note">
                  <ShieldCheck size={20} />
                  <h3>What we collect</h3>
                  <p>
                    Provider, model, token counts, timestamp, customer ID, and
                    your feature tag. No prompts. No completions.
                  </p>
                </div>
                <a
                  className="text-button"
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                >
                  Check API health
                  <ExternalLink size={15} />
                </a>
              </section>
            </div>
          )}
          <footer className="main-footer">
            <span>
              <span className="footer-mark">▥</span> Clarity for your AI
              business.
            </span>
            <span>
              {mode === "demo"
                ? "Sample data · September 2026"
                : "USD · Current subscription billing periods"}
              <span className="footer-divider">/</span>All costs are estimates
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} profitability`}
            className="customer-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-button"
              aria-label="Close customer details"
              autoFocus
              onClick={() => setSelected(null)}
            >
              <X size={21} />
            </button>
            <span className="eyebrow">CUSTOMER ECONOMICS</span>
            <h1>{selected.name}</h1>
            <p>
              {selected.email} · {selected.plan}
            </p>
            <span
              className={`status ${status(selected, target) === "Healthy" ? "healthy" : "danger"}`}
            >
              {status(selected, target)}
            </span>
            <div className="drawer-metrics">
              <Metric
                label="Subscription revenue"
                value={money(selected.revenue)}
                note="Current billing period"
              />
              <Metric
                label="AI cost to date"
                value={money(selected.cost, 2)}
                note={`${selected.daysElapsed} days elapsed`}
              />
              <Metric
                hero
                label="Current margin"
                value={percent(margin(selected.revenue, selected.cost))}
                note="AI contribution only"
              />
            </div>
            <div className="forecast-box">
              <span>
                <Activity size={17} />
                BILLING-PERIOD FORECAST
              </span>
              <h2>
                {money(forecast(selected).cost, 2)}
                <small> projected AI cost</small>
              </h2>
              <p>
                Projected contribution:{" "}
                <strong>{money(forecast(selected).contribution, 2)}</strong> ·
                Margin: <strong>{percent(forecast(selected).margin)}</strong>
              </p>
              <small>
                Based on the last 7 days’ daily average and{" "}
                {selected.daysInPeriod - selected.daysElapsed} remaining days.
                {forecast(selected).daysToLoss
                  ? ` At this rate, costs exceed revenue in about ${forecast(selected).daysToLoss} days.`
                  : ""}
              </small>
            </div>
            <h2 className="drawer-section-title">Daily AI spend</h2>
            <Trend data={selected.daily} small />
            <h2 className="drawer-section-title">Feature breakdown</h2>
            {selected.features.map((f, i) => (
              <div className="breakdown-row" key={f.name}>
                <i style={{ background: colors[i % 4] }} />
                <span>{f.name}</span>
                <strong>{money(f.cost, 2)}</strong>
              </div>
            ))}
            <h2 className="drawer-section-title">Model breakdown</h2>
            {selected.models.map((m) => (
              <div className="breakdown-row" key={m.name}>
                <span>{m.name}</span>
                <strong>{money(m.cost, 2)}</strong>
              </div>
            ))}
            <div className="info-callout">
              <Sparkles size={20} />
              <p>
                {recommendations([selected], target)[0]?.body ??
                  "This customer is currently above your target margin. Keep monitoring their usage as they grow."}
              </p>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
