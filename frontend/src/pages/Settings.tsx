import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Copy, Check, Trash2, Plus, Bell, CreditCard, Link as LinkIcon } from "lucide-react";
import { api, AlertConfig, CreateAlertBody } from "@/lib/api";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { format, parseISO } from "date-fns";

export default function Settings() {
  const { projectId } = useParams();
  const qc = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });
  const pid = projectId ?? projects[0]?.id;
  const project = projects.find((p) => p.id === pid);

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts", pid],
    queryFn: () => api.alerts.list(pid!),
    enabled: !!pid,
  });

  const { data: stripeCustomers = [] } = useQuery({
    queryKey: ["stripe-customers", pid],
    queryFn: () => api.stripe.listCustomers(pid!),
    enabled: !!pid,
  });

  const [copied, setCopied] = useState(false);
  function copyKey() {
    if (!project) return;
    navigator.clipboard.writeText(project.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const rotateMutation = useMutation({
    mutationFn: () => api.projects.rotateKey(pid!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const deleteAlertMutation = useMutation({
    mutationFn: (alertId: string) => api.alerts.delete(pid!, alertId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts", pid] }),
  });

  const toggleAlertMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.alerts.toggle(pid!, id, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts", pid] }),
  });

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* API Key */}
      {project && (
        <Section title="SDK API Key" icon={<LinkIcon className="h-4 w-4" />}>
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2.5">
            <code className="flex-1 text-xs font-mono break-all">{project.api_key}</code>
            <button
              onClick={copyKey}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Set as <code className="bg-muted px-1 rounded">MARGINED_API_KEY</code> in your environment.
          </p>
          <button
            onClick={() => rotateMutation.mutate()}
            disabled={rotateMutation.isPending}
            className="mt-3 text-xs text-muted-foreground hover:text-destructive underline underline-offset-2"
          >
            {rotateMutation.isPending ? "Rotating…" : "Rotate key"}
          </button>
        </Section>
      )}

      {/* Billing */}
      <BillingSection />

      {/* Alerts */}
      <Section title="Alerts" icon={<Bell className="h-4 w-4" />}>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts configured.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onDelete={() => deleteAlertMutation.mutate(alert.id)}
                onToggle={(enabled) => toggleAlertMutation.mutate({ id: alert.id, enabled })}
              />
            ))}
          </div>
        )}
        {pid && <AddAlertForm projectId={pid} onCreated={() => qc.invalidateQueries({ queryKey: ["alerts", pid] })} />}
      </Section>

      {/* Stripe customer mappings */}
      <Section title="Stripe Customer Mappings" icon={<LinkIcon className="h-4 w-4" />}>
        <p className="text-sm text-muted-foreground mb-3">
          Link your SDK <code className="bg-muted px-1 rounded">user_id</code> values to Stripe customers to unlock the margin column.
        </p>
        {stripeCustomers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mappings yet.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">SDK user_id</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Stripe customer</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">MRR</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Plan</th>
                </tr>
              </thead>
              <tbody>
                {stripeCustomers.map((c) => (
                  <tr key={c.customer_id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono">{c.customer_id}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{c.stripe_customer}</td>
                    <td className="px-3 py-2 text-right">
                      {c.current_mrr_usd != null ? formatCurrency(c.current_mrr_usd) : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.plan_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pid && (
          <AddStripeMapping
            projectId={pid}
            onCreated={() => qc.invalidateQueries({ queryKey: ["stripe-customers", pid] })}
          />
        )}
      </Section>
    </div>
  );
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter — $49/mo",
  growth: "Growth — $149/mo",
};

function BillingSection() {
  const { data: billing } = useQuery({
    queryKey: ["billing"],
    queryFn: api.billing.status,
  });

  async function goTo(fn: () => Promise<{ url: string }>) {
    try {
      const { url } = await fn();
      if (url && url !== "#") window.location.href = url;
    } catch {
      // surfaced by button state; billing is optional in demo mode
    }
  }

  if (!billing) return null;
  const pct =
    billing.events_limit != null
      ? Math.min((billing.events_used / billing.events_limit) * 100, 100)
      : 0;
  const nearLimit = billing.events_limit != null && pct >= 80;

  return (
    <Section title="Plan & Usage" icon={<CreditCard className="h-4 w-4" />}>
      <div className="border rounded-lg px-4 py-3.5 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">{PLAN_LABELS[billing.plan] ?? billing.plan}</p>
          <p className="text-xs text-muted-foreground figure">
            {formatNumber(billing.events_used)}
            {billing.events_limit != null
              ? ` / ${formatNumber(billing.events_limit)} events`
              : " events · unlimited"}{" "}
            this month
          </p>
        </div>
        {billing.events_limit != null && (
          <div className="bg-muted rounded-full h-1 overflow-hidden">
            <div
              className={`h-full rounded-full ${nearLimit ? "bg-watch" : "bg-foreground/50"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {nearLimit && (
          <p className="text-xs text-watch">
            Events beyond the plan limit are dropped. Upgrade to keep tracking.
          </p>
        )}
        <div className="flex gap-2 pt-1">
          {billing.plan !== "growth" && (
            <button
              onClick={() => goTo(() => api.billing.checkout(billing.plan === "free" ? "starter" : "growth"))}
              className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-[13px] font-medium hover:opacity-90 active:scale-[0.96] transition-[opacity,scale]"
            >
              Upgrade to {billing.plan === "free" ? "Starter" : "Growth"}
            </button>
          )}
          {billing.plan !== "free" && (
            <button
              onClick={() => goTo(api.billing.portal)}
              className="border px-3 py-1.5 rounded-md text-[13px] hover:bg-muted transition-colors"
            >
              Manage subscription
            </button>
          )}
        </div>
      </div>
    </Section>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function AlertRow({ alert, onDelete, onToggle }: {
  alert: AlertConfig;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const typeLabel = {
    margin_threshold: "Margin threshold",
    feature_spend: "Feature spend",
    bill_forecast: "Bill forecast",
  }[alert.alert_type];

  return (
    <div className="flex items-center gap-3 border rounded-lg px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{typeLabel}</p>
        <p className="text-xs text-muted-foreground">
          Threshold: {alert.alert_type === "margin_threshold" ? `${alert.threshold}%` : formatCurrency(alert.threshold)} ·{" "}
          {alert.channel} → {alert.destination}
          {alert.last_fired_at && ` · Last fired ${format(parseISO(alert.last_fired_at), "MMM d")}`}
        </p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={alert.enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
      </label>
      <button onClick={onDelete} className="text-muted-foreground hover:text-destructive ml-1">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddAlertForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateAlertBody>({
    alert_type: "margin_threshold",
    threshold: 50,
    channel: "email",
    destination: "",
  });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.alerts.create(projectId, form);
      onCreated();
      setOpen(false);
      setForm({ alert_type: "margin_threshold", threshold: 50, channel: "email", destination: "" });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-2"
      >
        <Plus className="h-4 w-4" />
        Add alert
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 border rounded-lg px-4 py-3 space-y-3">
      <p className="text-sm font-medium">New alert</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Type</label>
          <select
            value={form.alert_type}
            onChange={(e) => setForm((f) => ({ ...f, alert_type: e.target.value as any }))}
            className="w-full border rounded px-2 py-1.5 text-sm bg-background"
          >
            <option value="margin_threshold">Margin threshold</option>
            <option value="feature_spend">Feature spend</option>
            <option value="bill_forecast">Bill forecast</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            {form.alert_type === "margin_threshold" ? "% of MRR" : "$ amount"}
          </label>
          <input
            type="number"
            value={form.threshold}
            onChange={(e) => setForm((f) => ({ ...f, threshold: parseFloat(e.target.value) }))}
            className="w-full border rounded px-2 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Channel</label>
          <select
            value={form.channel}
            onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as any }))}
            className="w-full border rounded px-2 py-1.5 text-sm bg-background"
          >
            <option value="email">Email</option>
            <option value="slack">Slack webhook</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            {form.channel === "email" ? "Email address" : "Webhook URL"}
          </label>
          <input
            type={form.channel === "email" ? "email" : "url"}
            value={form.destination}
            onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
            required
            className="w-full border rounded px-2 py-1.5 text-sm bg-background"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !form.destination}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddStripeMapping({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [sdkId, setSdkId] = useState("");
  const [stripeId, setStripeId] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.stripe.mapCustomer(projectId, { customer_id: sdkId, stripe_customer: stripeId });
      onCreated();
      setOpen(false);
      setSdkId("");
      setStripeId("");
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-2"
      >
        <Plus className="h-4 w-4" />
        Add mapping
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 border rounded-lg px-4 py-3 space-y-3">
      <p className="text-sm font-medium">Link SDK user to Stripe customer</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">SDK user_id</label>
          <input
            type="text"
            value={sdkId}
            onChange={(e) => setSdkId(e.target.value)}
            placeholder="user_abc123"
            required
            className="w-full border rounded px-2 py-1.5 text-sm bg-background font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Stripe customer ID</label>
          <input
            type="text"
            value={stripeId}
            onChange={(e) => setStripeId(e.target.value)}
            placeholder="cus_xyz789"
            required
            className="w-full border rounded px-2 py-1.5 text-sm bg-background font-mono"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded text-sm text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
