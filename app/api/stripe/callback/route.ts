import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { admin, requireOrg, failure, ApiError } from "@/lib/server";
import { stripe, syncStripe } from "@/lib/stripe";
export async function GET(req: Request) {
  try {
    const { org } = await requireOrg();
    const url = new URL(req.url),
      jar = await cookies(),
      expected = jar.get("stripe_oauth_state")?.value,
      state = url.searchParams.get("state"),
      code = url.searchParams.get("code");
    jar.delete({ name: "stripe_oauth_state", path: "/api/stripe" });
    if (
      !state ||
      !expected ||
      state.length !== expected.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(expected)) ||
      !code
    )
      throw new ApiError(
        "Invalid or expired Stripe authorization. Connect again.",
        400,
      );
    const token = await stripe().oauth.token({
      grant_type: "authorization_code",
      code,
    });
    if (!token.stripe_user_id)
      throw new ApiError("Stripe did not return an account.", 502);
    const { error } = await admin()
      .from("organizations")
      .update({ stripe_account_id: token.stripe_user_id })
      .eq("id", org.id);
    if (error) throw error;
    await syncStripe(org.id, token.stripe_user_id);
    return NextResponse.redirect(new URL("/?mode=live", process.env.APP_URL!));
  } catch (e) {
    return failure(e);
  }
}
