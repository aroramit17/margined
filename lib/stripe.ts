import Stripe from "stripe";
import { admin, ApiError } from "./server";
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new ApiError(
      "Stripe is not configured. Add STRIPE_SECRET_KEY and STRIPE_CLIENT_ID.",
      503,
    );
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export async function syncStripe(orgId: string, accountId: string) {
  const client = stripe(),
    db = admin();
  const rows: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  for await (const sub of client.subscriptions.list(
    { status: "all", limit: 100, expand: ["data.customer"] },
    { stripeAccount: accountId },
  )) {
    if (sub.status !== "active") {
      rows.push({ id: sub.id, status: sub.status });
      continue;
    }
    const customer = sub.customer as Stripe.Customer;
    if (customer.deleted) {
      warnings.push(`${sub.id}: deleted customer`);
      continue;
    }
    const items = sub.items.data;
    const invalid =
      sub.items.has_more ||
      items.length === 0 ||
      items.some(
        (i) =>
          i.price.currency !== "usd" ||
          i.price.recurring?.interval !== "month" ||
          i.price.recurring.interval_count !== 1 ||
          i.price.recurring.usage_type !== "licensed" ||
          i.price.billing_scheme !== "per_unit" ||
          i.price.unit_amount === null ||
          i.current_period_start !== items[0].current_period_start ||
          i.current_period_end !== items[0].current_period_end,
      ) ||
      sub.discounts.length > 0 ||
      items.some((i) => i.discounts.length > 0);
    if (invalid) {
      warnings.push(
        `${sub.id}: beta supports undiscounted, flat USD monthly subscriptions only`,
      );
      rows.push({ id: sub.id, status: "unsupported" });
      continue;
    }
    rows.push({
      id: sub.id,
      organization_id: orgId,
      customer_id: customer.id,
      customer_name: customer.name ?? customer.email ?? customer.id,
      customer_email: customer.email ?? "",
      plan: items.map((i) => i.price.nickname ?? i.price.id).join(" + "),
      revenue: items.reduce(
        (n, i) => n + ((i.price.unit_amount ?? 0) * (i.quantity ?? 1)) / 100,
        0,
      ),
      currency: "usd",
      period_start: new Date(
        items[0].current_period_start * 1000,
      ).toISOString(),
      period_end: new Date(items[0].current_period_end * 1000).toISOString(),
      status: sub.status,
    });
  }
  // Product attribution is managed through the validated subscription mapping endpoint.
  for (const row of rows) {
    if ("customer_id" in row) {
      const { error } = await db
        .from("subscriptions")
        .upsert(row, { onConflict: "organization_id,id" });
      if (error) throw error;
    } else {
      const { error } = await db
        .from("subscriptions")
        .update({ status: row.status })
        .eq("organization_id", orgId)
        .eq("id", row.id);
      if (error) throw error;
    }
  }
  const { error: warningError } = await db
    .from("organizations")
    .update({ stripe_sync_warnings: warnings })
    .eq("id", orgId);
  if (warningError) throw warningError;
  return { synced: rows.filter((r) => "customer_id" in r).length, warnings };
}
