import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const configured = () =>
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
export function admin() {
  if (!configured())
    throw new ApiError(
      "Live mode needs Supabase configuration. See the setup guide in README.md.",
      503,
    );
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function session() {
  if (!configured())
    throw new ApiError(
      "Live mode needs Supabase configuration. See README.md.",
      503,
    );
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) =>
          values.forEach(({ name, value, options }) =>
            jar.set(name, value, options),
          ),
      },
    },
  );
}
export async function requireOrg() {
  const db = await session();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new ApiError("Sign in to access your live workspace.", 401);
  const { data: org, error: orgError } = await db
    .from("organizations")
    .select("*")
    .eq("owner_id", user.id)
    .single();
  if (orgError || !org)
    throw new ApiError(
      "No organization found. Apply the database migration before signing up.",
      409,
    );
  return { db, org, user };
}
export function failure(e: unknown) {
  if (e instanceof ApiError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError)
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  if (e && typeof e === "object" && "issues" in e)
    return NextResponse.json(
      { error: "Invalid request", issues: e.issues },
      { status: 400 },
    );
  console.error(
    "Request failed:",
    e instanceof Error ? e.message : "Database request error",
  );
  return NextResponse.json(
    {
      error:
        "The request could not be completed. Check server configuration and retry.",
    },
    { status: 500 },
  );
}
export async function jsonBody(req: Request, maxBytes = 262144) {
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("Request body required");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError("Request body too large", 413);
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_URL ?? new URL(req.url).origin;
  if (origin && origin !== expected)
    throw new ApiError("Origin not allowed", 403);
}
