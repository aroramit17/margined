import { createHash } from "node:crypto";
import { z } from "zod";
import { admin, ApiError, failure, jsonBody } from "@/lib/server";
import { eventSchema, priceEvent, PRICING_VERSION } from "@/lib/costs";
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
    if (!token?.startsWith("inf_live_"))
      throw new ApiError("A valid product API key is required.", 401);
    const events = z
      .object({ events: z.array(eventSchema).min(1).max(100) })
      .strict()
      .parse(await jsonBody(req));
    const db = admin();
    const { data: key, error } = await db
      .from("api_keys")
      .select("id,organization_id,product_id")
      .eq("key_hash", createHash("sha256").update(token).digest("hex"))
      .is("revoked_at", null)
      .single();
    if (error || !key) throw new ApiError("Invalid or revoked API key.", 401);
    let rows;
    try {
      rows = events.events.map((e) => ({
        ...e,
        cost: priceEvent(e),
        pricingVersion: PRICING_VERSION,
      }));
    } catch (e) {
      throw new ApiError((e as Error).message, 422);
    }
    const { data: accepted, error: insertError } = await db.rpc(
      "ingest_events",
      { p_key: key.id, p_events: rows },
    );
    if (insertError) {
      if (insertError.message.includes("limit"))
        throw new ApiError(
          "Monthly event limit exceeded. Upgrade your tier before sending more events.",
          429,
        );
      throw insertError;
    }
    return Response.json({
      accepted,
      submitted: rows.length,
      pricingVersion: PRICING_VERSION,
    });
  } catch (e) {
    return failure(e);
  }
}
