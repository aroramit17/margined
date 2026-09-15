/** Scheduled jobs use a dedicated secret, never an end-user JWT. */
export function withCronAuth(
  handler: (request: Request) => Promise<Response>,
  getSecret: () => string | undefined = () => Deno.env.get("CRON_SECRET"),
): (request: Request) => Promise<Response> {
  return async (request) => {
    const secret = getSecret();
    if (!secret || secret.length < 32) {
      return Response.json({ error: "Scheduler authorization is not configured" }, { status: 503 });
    }
    const supplied = request.headers.get("authorization") ?? "";
    if (supplied.length > 512) return new Response(null, { status: 401 });
    const encoder = new TextEncoder();
    const [expectedHash, suppliedHash] = await Promise.all(
      [`Bearer ${secret}`, supplied].map(async (value) => new Uint8Array(
        await crypto.subtle.digest("SHA-256", encoder.encode(value)),
      )),
    );
    let difference = 0;
    for (let i = 0; i < expectedHash.length; i++) difference |= expectedHash[i] ^ suppliedHash[i];
    if (difference !== 0) return new Response(null, { status: 401 });
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    return handler(request);
  };
}
