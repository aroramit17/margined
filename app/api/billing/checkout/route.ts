import { z } from "zod";
import {
  requireOrg,
  failure,
  ApiError,
  jsonBody,
  sameOrigin,
} from "@/lib/server";
import { stripe } from "@/lib/stripe";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { org, user } = await requireOrg();
    const { tier } = z
      .object({ tier: z.number().int().min(1).max(3) })
      .parse(await jsonBody(req));
    const price = process.env[`STRIPE_LTD_TIER_${tier}_PRICE_ID`];
    if (!price || !process.env.APP_URL)
      throw new ApiError("Lifetime checkout is not configured yet.", 503);
    const checkout = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: org.id,
      metadata: { organization_id: org.id, tier: String(tier) },
      success_url: `${process.env.APP_URL}/?mode=live`,
      cancel_url: `${process.env.APP_URL}/?mode=live`,
      allow_promotion_codes: false,
    });
    return Response.json({ url: checkout.url });
  } catch (e) {
    return failure(e);
  }
}
