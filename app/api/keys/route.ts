import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import {
  admin,
  ApiError,
  requireOrg,
  failure,
  jsonBody,
  sameOrigin,
} from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { org, db } = await requireOrg();
    const { productId } = z
      .object({ productId: z.string().uuid() })
      .parse(await jsonBody(req));
    const { data: product } = await db
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("organization_id", org.id)
      .single();
    if (!product) throw new ApiError("Product not found.", 404);
    const key = `inf_live_${randomBytes(32).toString("hex")}`;
    const { error } = await admin()
      .from("api_keys")
      .insert({
        organization_id: org.id,
        product_id: productId,
        key_hash: createHash("sha256").update(key).digest("hex"),
        prefix: key.slice(0, 17),
      });
    if (error) throw error;
    return Response.json({ key }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
export async function GET() {
  try {
    const { org } = await requireOrg();
    const { data, error } = await admin()
      .from("api_keys")
      .select("id,product_id,prefix,created_at,revoked_at")
      .eq("organization_id", org.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const { org } = await requireOrg();
    const { id } = z
      .object({ id: z.string().uuid() })
      .parse(await jsonBody(req));
    const { data, error } = await admin()
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", org.id)
      .select("id")
      .single();
    if (error || !data) throw new ApiError("Key not found", 404);
    return Response.json({ revoked: true });
  } catch (e) {
    return failure(e);
  }
}
