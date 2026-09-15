import { withCronAuth } from "./cron-auth.ts";

const secret = "synthetic-scheduler-secret-32-characters";
function assert(condition: unknown) { if (!condition) throw new Error("Assertion failed"); }
Deno.test("unauthorized requests never reach privileged job work", async () => {
  let calls = 0;
  const run = withCronAuth(async () => { calls++; return new Response("done"); }, () => secret);
  for (const authorization of ["", "Bearer wrong", "Bearer user-jwt", "Bearer "+"a".repeat(513)]) {
    const response = await run(new Request("https://example.invalid/job", { method: "POST", headers: { authorization } }));
    assert(response.status === 401);
  }
  assert(calls === 0);
  assert((await run(new Request("https://example.invalid/job", { headers: { authorization: `Bearer ${secret}` } }))).status === 405);
  assert(calls === 0);
  assert((await run(new Request("https://example.invalid/job", { method:"POST", headers: { authorization:`Bearer ${secret}` } }))).status === 200);
  assert(calls === 1);
});
Deno.test("missing or short scheduler secrets fail closed", async () => {
  for (const configured of [undefined, "", "short"]) {
    const run = withCronAuth(async () => { throw new Error("Must not run"); }, () => configured);
    assert((await run(new Request("https://example.invalid/job", { method:"POST" }))).status === 503);
  }
});
Deno.test("both deployed entrypoints retain the authorization wrapper", async () => {
  for (const job of ["hourly-rollup", "daily-alerts"]) {
    const source = await Deno.readTextFile(new URL(`../${job}/index.ts`, import.meta.url));
    assert(source.includes("Deno.serve(withCronAuth("));
  }
});
