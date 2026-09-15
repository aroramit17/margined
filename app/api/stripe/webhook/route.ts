import { admin, ApiError, failure } from "@/lib/server";
import { stripe, syncStripe } from "@/lib/stripe";
export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new ApiError("Stripe webhook is not configured.", 503);
    const sig = req.headers.get("stripe-signature");
    if (!sig) throw new ApiError("Missing Stripe signature", 400);
    let event;
    try {
      event = stripe().webhooks.constructEvent(
        await req.text(),
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new ApiError("Invalid Stripe signature", 400);
    }
    if (
      event.account &&
      [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type)
    ) {
      const { data: org } = await admin()
        .from("organizations")
        .select("id")
        .eq("stripe_account_id", event.account)
        .single();
      if (org) await syncStripe(org.id, event.account);
    }
    return Response.json({ received: true });
  } catch (e) {
    return failure(e);
  }
}
