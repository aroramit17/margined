import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Transport } from "../src/transport.js";
import type { MarginedEvent } from "../src/extract.js";

const event = { event_id: "stable-id", customer_id: "c" } as MarginedEvent;
let transport: Transport;
let beforeExitListeners: Array<(...args: any[]) => void>;
beforeEach(() => {
  vi.useFakeTimers();
  beforeExitListeners = process.listeners("beforeExit");
  transport = new Transport("synthetic-key", "https://example.invalid/ingest");
});
afterEach(async () => {
  await transport.shutdown();
  for (const listener of process.listeners("beforeExit")) {
    if (!beforeExitListeners.includes(listener)) process.removeListener("beforeExit", listener);
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("retained transport retries", () => {
  it.each([429, 503])("defers %s until Retry-After without changing IDs", async (status) => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status, headers: { "Retry-After": "10" } }))
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    transport.enqueue({ ...event });
    await transport.flush();
    await transport.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await transport.flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([, options]) => JSON.parse(options.body).events[0].event_id))
      .toEqual(["stable-id", "stable-id"]);
  });
  it("long quota cooldown does not block flush or shutdown", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status:429, headers:{"Retry-After":"86400"} }));
    vi.stubGlobal("fetch", fetch);
    transport.enqueue({ ...event });
    await transport.flush();
    await transport.shutdown();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("permanent validation rejection is visible and is not retried", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status:422 }));
    vi.stubGlobal("fetch", fetch);
    transport.enqueue({ ...event });
    await transport.flush(); await transport.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledOnce();
  });
  it("retryable errors without a delay use backoff", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status:503 }))
      .mockResolvedValue(new Response(null, { status:202 }));
    vi.stubGlobal("fetch", fetch);
    transport.enqueue({ ...event });
    const flush = transport.flush();
    await vi.advanceTimersByTimeAsync(1000); await flush;
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
