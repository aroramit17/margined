import { beforeEach, describe, expect, it } from "vitest";
import * as margined from "../src/index";
import { PRICES, computeCost, detectProvider, resolvePrice } from "../src/pricing";
import { buildEvent } from "../src/extract";

class FakeTransport {
  events: unknown[] = [];
  apiKey = "test";
  endpoint = "http://test";
  enqueue(event: unknown) {
    this.events.push(event);
  }
  flush() {
    return Promise.resolve();
  }
  shutdown() {
    return Promise.resolve();
  }
}

function anthropicResponse(overrides: Partial<Record<string, number>> = {}) {
  return {
    model: "claude-sonnet-4-6",
    usage: {
      input_tokens: overrides.input ?? 100,
      output_tokens: overrides.output ?? 50,
      cache_read_input_tokens: overrides.cacheRead ?? 0,
      cache_creation_input_tokens: overrides.cacheWrite ?? 0,
    },
  };
}

function openaiResponse(prompt = 100, completion = 50, cached = 0) {
  return {
    model: "gpt-4o",
    usage: {
      prompt_tokens: prompt,
      completion_tokens: completion,
      prompt_tokens_details: { cached_tokens: cached },
    },
  };
}

let transport: FakeTransport;

beforeEach(() => {
  margined._internal.reset();
  transport = new FakeTransport();
  margined._internal.setTransport(transport);
});

describe("pricing", () => {
  it("prices known models", () => {
    expect(computeCost("claude-sonnet-4-6", 1000, 500)).toBeCloseTo(1000 * 3e-6 + 500 * 15e-6, 10);
  });

  it("prices cache tokens at discount rates", () => {
    const cost = computeCost("claude-opus-5", 10_000, 2_000, 5_000, 1_000);
    const expected = 10_000 * 5e-6 + 2_000 * 25e-6 + 5_000 * 0.5e-6 + 1_000 * 6.25e-6;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("resolves dated snapshots and provider prefixes", () => {
    expect(resolvePrice("claude-haiku-4-5-20251001")).toEqual(PRICES["claude-haiku-4-5"]);
    expect(resolvePrice("anthropic.claude-opus-5")).toEqual(PRICES["claude-opus-5"]);
    expect(resolvePrice("openai/gpt-4o")).toEqual(PRICES["gpt-4o"]);
    expect(resolvePrice("gpt-4o-mini-2024-07-18")).toEqual(PRICES["gpt-4o-mini"]);
  });

  it("detects providers", () => {
    expect(detectProvider("claude-opus-5")).toBe("anthropic");
    expect(detectProvider("o4-mini")).toBe("openai");
    expect(detectProvider("gemini-2.5-pro")).toBe("google");
  });
});

describe("extract", () => {
  it("builds events from anthropic responses", () => {
    const event = buildEvent(anthropicResponse({ cacheRead: 900, cacheWrite: 50 }), {
      userId: "u1",
      feature: "chat",
    });
    expect(event?.customer_id).toBe("u1");
    expect(event?.cache_read_tokens).toBe(900);
    expect(event?.cache_write_tokens).toBe(50);
    expect(event?.event_id).toBeTruthy();
    expect(event?.cost_usd).toBeGreaterThan(0);
  });

  it("subtracts openai cached tokens from input", () => {
    const event = buildEvent(openaiResponse(1000, 30, 800), { userId: "u", feature: "f" });
    expect(event?.input_tokens).toBe(200);
    expect(event?.cache_read_tokens).toBe(800);
  });

  it("returns null without usage", () => {
    expect(buildEvent({ model: "x" }, { userId: "u", feature: "f" })).toBeNull();
  });
});

describe("track", () => {
  it("returns the response unchanged and queues an event", () => {
    const response = anthropicResponse();
    expect(margined.track(response, { userId: "u1", feature: "test" })).toBe(response);
    expect(transport.events).toHaveLength(1);
  });

  it("never throws on bad input", () => {
    expect(margined.track(null, { userId: "u", feature: "f" })).toBeNull();
    expect(transport.events).toHaveLength(0);
  });
});

describe("context", () => {
  it("withContext scopes user across async boundaries", async () => {
    await margined.withContext({ userId: "scoped", feature: "feat" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(margined._internal.resolveContext().userId).toBe("scoped");
    });
    expect(margined._internal.resolveContext().userId).toBeUndefined();
  });

  it("withRun sets run id inherited by track", () => {
    margined.withRun({ userId: "u", feature: "agent" }, (runId) => {
      margined.track(anthropicResponse(), { userId: "u", feature: "agent" });
      expect((transport.events[0] as { run_id: string }).run_id).toBe(runId);
    });
  });

  it("setContext callables resolve lazily and fail-open", () => {
    margined.setContext({
      userId: () => {
        throw new Error("db down");
      },
    });
    expect(margined._internal.resolveContext().userId).toBeUndefined();
  });
});

describe("wrap", () => {
  it("tracks calls made through a wrapped client", async () => {
    const client = {
      messages: {
        create: async () => anthropicResponse(),
      },
    };
    const wrapped = margined.wrap(client);
    await margined.withContext({ userId: "w1", feature: "chat" }, async () => {
      await wrapped.messages.create();
    });
    expect(transport.events).toHaveLength(1);
    expect((transport.events[0] as { customer_id: string }).customer_id).toBe("w1");
  });

  it("skips calls with no resolvable user", async () => {
    const client = { messages: { create: async () => anthropicResponse() } };
    await margined.wrap(client).messages.create();
    expect(transport.events).toHaveLength(0);
  });
});

describe("streaming", () => {
  async function* anthropicStream() {
    yield {
      type: "message_start",
      message: {
        model: "claude-sonnet-4-6",
        usage: { input_tokens: 120, output_tokens: 1, cache_read_input_tokens: 40 },
      },
    };
    yield { type: "content_block_delta" };
    yield { type: "message_delta", usage: { output_tokens: 77 } };
  }

  it("records final usage from an anthropic stream", async () => {
    const stream = margined.trackStream(anthropicStream(), { userId: "u", feature: "chat" });
    const seen: unknown[] = [];
    for await (const event of stream) seen.push(event);
    expect(seen).toHaveLength(3);
    const event = transport.events[0] as Record<string, number | string>;
    expect(event.input_tokens).toBe(120);
    expect(event.output_tokens).toBe(77);
    expect(event.cache_read_tokens).toBe(40);
    expect(event.model).toBe("claude-sonnet-4-6");
  });

  it("records openai usage chunk", async () => {
    async function* openaiStream() {
      yield { model: "gpt-4o", choices: [{}] };
      yield {
        model: "gpt-4o",
        choices: [],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 30,
          prompt_tokens_details: { cached_tokens: 100 },
        },
      };
    }
    for await (const _ of margined.trackStream(openaiStream(), { userId: "u", feature: "f" })) {
      // drain
    }
    const event = transport.events[0] as Record<string, number>;
    expect(event.input_tokens).toBe(100);
    expect(event.cache_read_tokens).toBe(100);
    expect(event.output_tokens).toBe(30);
  });

  it("records nothing when the stream has no usage", async () => {
    async function* empty() {
      yield { type: "noop" };
    }
    for await (const _ of margined.trackStream(empty(), { userId: "u", feature: "f" })) {
      // drain
    }
    expect(transport.events).toHaveLength(0);
  });
});
