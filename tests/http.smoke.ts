import assert from "node:assert/strict";
async function main() {
  const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
  for (const path of ["/", "/login"]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    assert.ok(
      (await r.text()).includes("Inferlytic") || path === "/login",
      "HTML contains app metadata",
    );
  }
  const health = await (await fetch(base + "/api/health")).json();
  assert.equal(health.status, "ok");
  const r = await fetch(base + "/api/v1/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"events":[]}',
  });
  assert.equal(r.status, 401);
  assert.equal(
    (await fetch(base + "/api/jobs/daily", { method: "POST" })).status,
    401,
  );
  const dashboard = await fetch(base + "/api/dashboard");
  assert.ok([401, 503].includes(dashboard.status));
  const payload = await dashboard.json();
  assert.ok(
    !("customers" in payload),
    "Unauthorized access must not receive customer data",
  );
  console.log(
    "HTTP smoke checks passed: pages, health, ingestion authentication, job authorization, private dashboard.",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
