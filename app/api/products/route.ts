import { z } from "zod";
import { admin, requireOrg, failure, jsonBody, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { org } = await requireOrg();
    const { name } = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(await jsonBody(req));
    const { data, error } = await admin().rpc("create_product", {
      p_org: org.id,
      p_name: name,
    });
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return failure(e);
  }
}
