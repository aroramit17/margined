import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireOrg, failure, ApiError } from "@/lib/server";
import { NextResponse } from "next/server";
export async function GET() {
  try {
    await requireOrg();
    if (!process.env.STRIPE_CLIENT_ID || !process.env.APP_URL)
      throw new ApiError(
        "Set STRIPE_CLIENT_ID and APP_URL to connect Stripe.",
        503,
      );
    const state = randomBytes(32).toString("hex");
    (await cookies()).set("stripe_oauth_state", state, {
      httpOnly: true,
      secure: process.env.APP_URL.startsWith("https:"),
      sameSite: "lax",
      maxAge: 600,
      path: "/api/stripe",
    });
    const url = new URL("https://connect.stripe.com/oauth/authorize");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: process.env.STRIPE_CLIENT_ID,
      scope: "read_only",
      state,
      redirect_uri: `${process.env.APP_URL}/api/stripe/callback`,
    }).toString();
    return NextResponse.redirect(url);
  } catch (e) {
    return failure(e);
  }
}
