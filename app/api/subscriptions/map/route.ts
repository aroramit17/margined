import { z } from "zod";
import {
  requireOrg,
  admin,
  ApiError,
  failure,
  jsonBody,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { org, db } = await requireOrg();
    const { subscriptionId, productId } = z
      .object({
        subscriptionId: z.string().min(1).max(200),
        productId: z.string().uuid(),
      })
      .parse(await jsonBody(req));
    const { data: p } = await db
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("organization_id", org.id)
      .single();
    if (!p) throw new ApiError("Product not found", 404);
    const { data, error } = await admin()
      .from("subscriptions")
      .update({ product_id: productId })
      .eq("organization_id", org.id)
      .eq("id", subscriptionId)
      .select("id")
      .single();
    if (error || !data) throw new ApiError("Subscription not found", 404);
    return Response.json({ mapped: true });
  } catch (e) {
    return failure(e);
  }
}
export async function GET() {
  try {
    const { db, org } = await requireOrg();
    const { data, error } = await db
      .from("subscriptions")
      .select("id,customer_name,plan,product_id,status")
      .eq("organization_id", org.id)
      .order("customer_name");
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return failure(e);
  }
}
