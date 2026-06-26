/**
 * Daily Alerts Edge Function
 * Checks alert configs and fires notifications via email (Resend) or Slack webhook.
 * Triggered by Supabase cron: "0 9 * * *" (daily at 9am UTC)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

interface AlertConfig {
  id: string;
  project_id: string;
  alert_type: "margin_threshold" | "feature_spend" | "bill_forecast";
  threshold: number;
  channel: "email" | "slack";
  destination: string;
  last_fired_at: string | null;
  enabled: boolean;
}

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "alerts@trymargined.com",
      to,
      subject,
      html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
    }),
  });
}

async function sendSlack(webhookUrl: string, message: string) {
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
}

async function deliver(alert: AlertConfig, subject: string, message: string) {
  try {
    if (alert.channel === "email") {
      await sendEmail(alert.destination, subject, message);
    } else if (alert.channel === "slack") {
      await sendSlack(alert.destination, `*${subject}*\n${message}`);
    }
    // Record last_fired_at
    await supabase
      .from("alert_configs")
      .update({ last_fired_at: new Date().toISOString() })
      .eq("id", alert.id);
  } catch (err) {
    console.error("Delivery failed for alert", alert.id, err);
  }
}

Deno.serve(async (_req) => {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // Fetch all enabled alert configs
  const { data: alerts } = await supabase
    .from("alert_configs")
    .select("*")
    .eq("enabled", true);

  if (!alerts || alerts.length === 0) {
    return new Response(JSON.stringify({ fired: 0 }), { status: 200 });
  }

  let fired = 0;

  for (const alert of alerts as AlertConfig[]) {
    const projectId = alert.project_id;

    // Don't fire more than once per day
    if (alert.last_fired_at) {
      const lastFired = new Date(alert.last_fired_at);
      if (lastFired.toDateString() === today.toDateString()) continue;
    }

    if (alert.alert_type === "margin_threshold") {
      // Check each customer's margin this month
      const { data: rollups } = await supabase
        .from("daily_rollups")
        .select("customer_id, total_cost")
        .eq("project_id", projectId)
        .gte("date", monthStart.toISOString().split("T")[0]);

      const costByCustomer: Record<string, number> = {};
      for (const row of rollups ?? []) {
        costByCustomer[row.customer_id] = (costByCustomer[row.customer_id] ?? 0) + parseFloat(row.total_cost);
      }

      const { data: stripeCustomers } = await supabase
        .from("stripe_customers")
        .select("customer_id, current_mrr_usd, plan_name")
        .eq("project_id", projectId);

      const stripeMap = Object.fromEntries(
        (stripeCustomers ?? []).map((c) => [c.customer_id, c])
      );

      for (const [customerId, cost] of Object.entries(costByCustomer)) {
        const stripe = stripeMap[customerId];
        if (!stripe?.current_mrr_usd) continue;
        const mrr = parseFloat(stripe.current_mrr_usd);
        const pct = cost / mrr;
        if (pct >= alert.threshold / 100) {
          const margin = ((mrr - cost) / mrr * 100).toFixed(1);
          const subject = `⚠️ Margin Alert: ${customerId} (${stripe.plan_name ?? "Unknown plan"})`;
          const message = `Customer ${customerId} (${stripe.plan_name ?? "Unknown"}, $${mrr}/mo) has incurred $${cost.toFixed(2)} in LLM costs this month — ${(pct * 100).toFixed(0)}% of their subscription.\n\nCurrent gross margin: ${margin}%`;
          await deliver(alert, subject, message);
          fired++;
        }
      }
    }

    if (alert.alert_type === "feature_spend") {
      // Check if any feature exceeded the threshold this month
      const { data: rollups } = await supabase
        .from("daily_rollups")
        .select("feature, total_cost")
        .eq("project_id", projectId)
        .gte("date", monthStart.toISOString().split("T")[0]);

      const costByFeature: Record<string, number> = {};
      for (const row of rollups ?? []) {
        costByFeature[row.feature] = (costByFeature[row.feature] ?? 0) + parseFloat(row.total_cost);
      }

      for (const [feature, cost] of Object.entries(costByFeature)) {
        if (cost >= alert.threshold) {
          const projected = (cost / daysElapsed * daysInMonth).toFixed(2);
          const subject = `⚠️ Feature Spend Alert: ${feature}`;
          const message = `Feature \`${feature}\` has crossed $${alert.threshold} this month (current: $${cost.toFixed(2)}).\n\nOn track for $${projected} by month end.`;
          await deliver(alert, subject, message);
          fired++;
        }
      }
    }

    if (alert.alert_type === "bill_forecast") {
      // Check if projected month-end bill exceeds threshold
      const { data: rollups } = await supabase
        .from("daily_rollups")
        .select("total_cost")
        .eq("project_id", projectId)
        .gte("date", monthStart.toISOString().split("T")[0]);

      const totalMtd = (rollups ?? []).reduce((s, r) => s + parseFloat(r.total_cost), 0);
      const projected = (totalMtd / daysElapsed) * daysInMonth;

      if (projected >= alert.threshold) {
        const subject = `⚠️ Bill Forecast Alert`;
        const message = `Your LLM bill is on track for $${projected.toFixed(2)} this month (threshold: $${alert.threshold}).\n\nCurrent MTD spend: $${totalMtd.toFixed(2)} with ${daysInMonth - daysElapsed} days remaining.`;
        await deliver(alert, subject, message);
        fired++;
      }
    }
  }

  return new Response(JSON.stringify({ fired }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
