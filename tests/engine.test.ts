import { test } from "node:test";
import assert from "node:assert/strict";
import {
  margin,
  forecast,
  simulate,
  breakdown,
  sum,
  recommendations,
} from "../lib/engine";
import { demoData } from "../lib/demo";
import { priceEvent, eventSchema } from "../lib/costs";
import { randomUUID } from "node:crypto";
test("demo totals reconcile across customers, features, models and daily usage", () => {
  const d = demoData();
  const cost = sum(d.customers, (c) => c.cost);
  for (const total of [
    sum(d.daily, (d) => d.cost),
    sum(breakdown(d.customers, "features"), (f) => f.cost),
    sum(breakdown(d.customers, "models"), (m) => m.cost),
  ])
    assert.ok(Math.abs(total - cost) < 1e-8);
  for (const c of d.customers)
    for (const f of c.features) assert.ok(f.cost >= 0);
  assert.equal(d.customers.length, 24);
  assert.ok(recommendations(d.customers).some((a) => a.customerId));
});
test("zero revenue never invents a percentage", () => {
  assert.equal(margin(0, 10), null);
  assert.equal(margin(100, 120), -20);
});
test("forecast adds only remaining-period usage and identifies loss timing", () => {
  const c = {
    ...demoData().customers[0],
    revenue: 49,
    cost: 28,
    daysElapsed: 14,
    daysInPeriod: 30,
    recentDailyCost: 2,
  };
  const f = forecast(c);
  assert.equal(f.cost, 60);
  assert.equal(f.contribution, -11);
  assert.equal(f.daysToLoss, 11);
  assert.equal(forecast({ ...c, daysElapsed: 30 }).cost, 28);
});
test("simulator changes only the selected feature share", () => {
  const s = simulate(59, 20, 50, 0.6);
  assert.equal(s.cost, 14);
  assert.equal(s.contribution, 45);
  assert.equal(simulate(0, 20, 100, 0.6).margin, null);
});
const base = () =>
  eventSchema.parse({
    id: randomUUID(),
    customerId: "cus_test",
    provider: "openai",
    model: "gpt-4.1-mini",
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    timestamp: new Date().toISOString(),
  });
test("OpenAI cached tokens are a subset of total input tokens", () => {
  assert.equal(priceEvent(base()), 2);
  assert.equal(priceEvent({ ...base(), cachedInputTokens: 500000 }), 1.85);
  assert.throws(
    () => priceEvent({ ...base(), cachedInputTokens: 1000001 }),
    /cache/,
  );
});
test("Anthropic cache writes and reads are additional to base input", () => {
  assert.equal(
    priceEvent({
      ...base(),
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      cachedInputTokens: 1000000,
      cacheWriteTokens: 1000000,
      cacheWrite1hTokens: 1000000,
    }),
    28.05,
  );
});
test("unknown models, negative tokens, content fields and stale timestamps are rejected", () => {
  assert.throws(
    () => priceEvent({ ...base(), model: "unknown" }),
    /Unsupported/,
  );
  assert.throws(() => eventSchema.parse({ ...base(), inputTokens: -1 }));
  assert.throws(() =>
    eventSchema.parse({ ...base(), prompt: "Do not collect this" }),
  );
  assert.throws(() =>
    eventSchema.parse({ ...base(), timestamp: "2020-01-01T00:00:00.000Z" }),
  );
});

test("critical margins alert even when the configurable target is lower", () => {
  const c = {
    ...demoData().customers[0],
    revenue: 100,
    cost: 75,
    daysElapsed: 30,
    daysInPeriod: 30,
  };
  assert.equal(recommendations([c], 20)[0].kind, "critical");
});
