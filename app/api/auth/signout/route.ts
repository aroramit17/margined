import { session, failure, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const db = await session();
    const { error } = await db.auth.signOut();
    if (error) throw error;
    return Response.json({ signedOut: true });
  } catch (e) {
    return failure(e);
  }
}
