import { session, failure } from "@/lib/server";
import { NextResponse } from "next/server";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    if (code) {
      const db = await session();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error)
        return NextResponse.redirect(
          new URL("/?mode=live", process.env.APP_URL ?? url.origin),
        );
    }
    return NextResponse.redirect(
      new URL("/login", process.env.APP_URL ?? url.origin),
    );
  } catch (e) {
    return failure(e);
  }
}
