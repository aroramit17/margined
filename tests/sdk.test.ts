import { test } from "node:test";
import assert from "node:assert/strict";
import { Inferlytic } from "../packages/sdk/src/index";
test("concurrent provider calls preserve customer attribution and never send prompts", async () => {
  const bodies: any[] = [];
  const sdk = new Inferlytic({
    apiKey: "test",
    endpoint: "http://localhost:3000/api/v1/events",
    flushIntervalMs: 0,
    fetch: async (_u, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return new Response("{}");
    },
  });
  const original = {
    chat: {
      completions: {
        async create(p: any) {
          await new Promise((r) => setTimeout(r, p.delay));
          return {
            model: "gpt-4.1-mini",
            choices: [{ message: { content: "private output" } }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 40,
              prompt_tokens_details: { cached_tokens: 20 },
            },
          };
        },
      },
    },
    responses: {},
  };
  const client = sdk.wrapOpenAI(original);
  await Promise.all(
    ["a", "b", "c"].map((id, i) =>
      sdk.withCustomer({ customerId: id, feature: `feature-${id}` }, async () =>
        client.chat.completions.create({
          delay: 10 - i * 4,
          messages: [{ content: "private prompt" }],
        }),
      ),
    ),
  );
  await sdk.flush();
  assert.deepEqual(bodies[0].events.map((e: any) => e.customerId).sort(), [
    "a",
    "b",
    "c",
  ]);
  for (const e of bodies[0].events)
    assert.equal(e.feature, `feature-${e.customerId}`);
  assert.ok(!JSON.stringify(bodies).includes("private"));
  assert.equal(sdk.queuedEvents, 0);
});
test("failed flush retries stable event IDs without dropping events", async () => {
  let calls = 0;
  const bodies: any[] = [];
  const sdk = new Inferlytic({
    apiKey: "test",
    endpoint: "http://localhost/api",
    flushIntervalMs: 0,
    fetch: async (_u, init) => {
      bodies.push(JSON.parse(init!.body as string));
      return new Response("{}", { status: ++calls === 1 ? 503 : 200 });
    },
  });
  sdk.track({
    customerId: "cus_a",
    provider: "openai",
    model: "gpt-4.1-mini",
    inputTokens: 10,
    outputTokens: 10,
  });
  await assert.rejects(sdk.flush(), /503/);
  assert.equal(sdk.queuedEvents, 1);
  await sdk.flush();
  assert.equal(bodies[0].events[0].id, bodies[1].events[0].id);
  assert.equal(sdk.queuedEvents, 0);
});
test("streaming and missing identity fail before requesting provider", async () => {
  let calls = 0;
  const sdk = new Inferlytic({
    apiKey: "test",
    endpoint: "http://localhost/api",
    flushIntervalMs: 0,
  });
  const client = sdk.wrapAnthropic({
    messages: {
      create: async (_p: any) => {
        calls++;
        return {};
      },
    },
  });
  await assert.rejects(
    sdk.withCustomer({ customerId: "x" }, () =>
      client.messages.create({ stream: true }),
    ),
    /streaming/,
  );
  await assert.rejects(client.messages.create({}), /withCustomer/);
  assert.equal(calls, 0);
});
test("Anthropic cache write durations are separately recorded", async () => {
  let event: any;
  const sdk = new Inferlytic({
    apiKey: "test",
    endpoint: "http://localhost/api",
    flushIntervalMs: 0,
    fetch: async (_u, i) => {
      event = JSON.parse(i!.body as string).events[0];
      return new Response("{}");
    },
  });
  const client = sdk.wrapAnthropic({
    messages: {
      create: async (_p: any) => ({
        model: "claude-sonnet-4-6",
        usage: {
          input_tokens: 20,
          output_tokens: 30,
          cache_creation_input_tokens: 100,
          cache_creation: {
            ephemeral_5m_input_tokens: 60,
            ephemeral_1h_input_tokens: 40,
          },
          cache_read_input_tokens: 80,
        },
      }),
    },
  });
  await sdk.withCustomer({ customerId: "x" }, () => client.messages.create({}));
  await sdk.flush();
  assert.equal(event.cacheWriteTokens, 60);
  assert.equal(event.cacheWrite1hTokens, 40);
  assert.equal(event.cachedInputTokens, 80);
});
