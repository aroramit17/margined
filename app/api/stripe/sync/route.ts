import { ApiError, requireOrg, failure, sameOrigin } from "@/lib/server";
import { syncStripe } from "@/lib/stripe";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { org } = await requireOrg();
    if (!org.stripe_account_id) throw new ApiError("Connect Stripe first.");
    return Response.json(await syncStripe(org.id, org.stripe_account_id));
  } catch (e) {
    return failure(e);
  }
}
