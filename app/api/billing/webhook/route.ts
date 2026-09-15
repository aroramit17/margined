import { stripe } from "@/lib/stripe";
import { admin, ApiError, failure } from "@/lib/server";
export async function POST(req: Request) {
  try {
    const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    if (!secret) throw new ApiError("Billing webhook is not configured", 503);
    const sig = req.headers.get("stripe-signature");
    if (!sig) throw new ApiError("Signature required");
    let event;
    try {
      event = stripe().webhooks.constructEvent(await req.text(), sig, secret);
    } catch {
      throw new ApiError("Invalid signature");
    }
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type) &&
      !event.account
    ) {
      const s = await stripe().checkout.sessions.retrieve(
        (event.data.object as { id: string }).id,
        { expand: ["line_items"] },
      );
      const org = s.metadata?.organization_id,
        tier = Number(s.metadata?.tier);
      if (
        s.payment_status === "paid" &&
        org &&
        [1, 2, 3].includes(tier) &&
        s.line_items?.data.length === 1 &&
        s.line_items.data[0].price?.id ===
          process.env[`STRIPE_LTD_TIER_${tier}_PRICE_ID`]
      ) {
        const { error } = await admin().rpc("grant_lifetime_tier", {
          p_org: org,
          p_tier: tier,
          p_session: s.id,
        });
        if (error) throw error;
      }
    }
    return Response.json({ received: true });
  } catch (e) {
    return failure(e);
  }
}
