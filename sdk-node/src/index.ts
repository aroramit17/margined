/**
 * Margined — LLM unit economics tracking for Node/TypeScript.
 *
 *     import * as margined from "margined";
 *     margined.init(); // reads MARGINED_API_KEY
 *
 *     // Mode 1 — explicit wrapper
 *     const response = margined.track(
 *       await client.messages.create({...}),
 *       { userId: user.id, feature: "summarize_document" },
 *     );
 *
 *     // Mode 2 — client wrapper (zero call-site changes)
 *     const anthropic = margined.wrap(new Anthropic());
 *     margined.setContext({ userId: () => currentUser.id });
 *
 * Fail-open by design: never throws into your app, never blocks a request,
 * bounded memory, idempotent delivery.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { buildEvent, buildEventFromUsage, usageFromObject, type MarginedEvent, type Tags } from "./extract.js";
import { Transport } from "./transport.js";

export { computeCost, detectProvider, resolvePrice, PRICES, PRICES_VERSION } from "./pricing.js";
export type { MarginedEvent, Tags } from "./extract.js";

const DEFAULT_ENDPOINT = "https://api.trymargined.com/ingest";

interface Context {
  userId?: string;
  feature?: string;
  runId?: string;
}

let transport: Transport | null = null;
let disabled = false;
let sampleRate = 1.0;
let userIdFn: (() => string | undefined | null) | null = null;
let featureFn: (() => string | undefined | null) | null = null;

const contextStore = new AsyncLocalStorage<Context>();

export interface InitOptions {
  apiKey?: string;
  endpoint?: string;
  sampleRate?: number;
  disabled?: boolean;
  debug?: boolean;
}

export function init(options: InitOptions = {}): void {
  disabled =
    options.disabled === true ||
    ["1", "true"].includes((process.env.MARGINED_DISABLED ?? "").toLowerCase());
  sampleRate = Math.min(1, Math.max(0, options.sampleRate ?? 1));
  const apiKey = options.apiKey ?? process.env.MARGINED_API_KEY;
  if (disabled || !apiKey) return;
  const endpoint = options.endpoint ?? process.env.MARGINED_ENDPOINT ?? DEFAULT_ENDPOINT;
  if (transport) {
    if (transport.apiKey === apiKey && transport.endpoint === endpoint) return;
    void transport.shutdown();
  }
  const debug =
    options.debug === true ||
    ["1", "true"].includes((process.env.MARGINED_DEBUG ?? "").toLowerCase());
  transport = new Transport(apiKey, endpoint, debug);
}

export function flush(): Promise<void> {
  return transport ? transport.flush() : Promise.resolve();
}

export async function shutdown(): Promise<void> {
  if (transport) {
    await transport.shutdown();
    transport = null;
  }
}

function record(event: MarginedEvent | null): void {
  if (!event || !transport || disabled) return;
  if (sampleRate < 1 && Math.random() >= sampleRate) return;
  transport.enqueue(event);
}

// ── Mode 1 — explicit wrapper ─────────────────────────────────

/** Transparent pass-through: returns `response` unchanged, records cost. */
export function track<T>(response: T, tags: Tags): T {
  try {
    const runId = tags.runId ?? contextStore.getStore()?.runId ?? null;
    record(buildEvent(response, { ...tags, runId }));
  } catch {
    /* fail-open */
  }
  return response;
}

// ── Context ───────────────────────────────────────────────────

export interface SetContextOptions {
  userId?: string | (() => string | undefined | null);
  feature?: string | (() => string | undefined | null);
}

/** Ambient context for wrapped clients (strings or per-request callables). */
export function setContext(options: SetContextOptions): void {
  if (typeof options.userId === "function") userIdFn = options.userId;
  else if (options.userId != null) {
    const value = options.userId;
    userIdFn = () => value;
  }
  if (typeof options.feature === "function") featureFn = options.feature;
  else if (options.feature != null) {
    const value = options.feature;
    featureFn = () => value;
  }
}

/** Scope user/feature/run to a callback (AsyncLocalStorage — async-safe). */
export function withContext<T>(context: Context, fn: () => T): T {
  const parent = contextStore.getStore() ?? {};
  return contextStore.run({ ...parent, ...context }, fn);
}

/** Group multi-step agent calls under one generated run id. */
export function withRun<T>(
  tags: { userId: string; feature: string },
  fn: (runId: string) => T,
): T {
  const runId = `run_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  return withContext({ ...tags, runId }, () => fn(runId));
}

function resolveContext(): { userId?: string; feature?: string; runId?: string } {
  const scoped = contextStore.getStore() ?? {};
  let userId = scoped.userId;
  let feature = scoped.feature;
  if (userId == null && userIdFn) {
    try {
      userId = userIdFn() ?? undefined;
    } catch {
      userId = undefined;
    }
  }
  if (feature == null && featureFn) {
    try {
      feature = featureFn() ?? undefined;
    } catch {
      feature = undefined;
    }
  }
  return { userId, feature, runId: scoped.runId };
}

// ── Mode 2 — client wrapper ───────────────────────────────────

const TRACKED_METHODS = new Set(["create"]);

/**
 * Wrap an Anthropic or OpenAI client so every call is tracked with ambient
 * context. Returns a proxy; the original client is untouched.
 *
 *     const anthropic = margined.wrap(new Anthropic());
 */
export function wrap<T extends object>(client: T): T {
  return deepProxy(client);
}

function deepProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value === "function" && TRACKED_METHODS.has(String(prop))) {
        return function (this: unknown, ...args: unknown[]) {
          const result = value.apply(obj, args);
          const streaming =
            args.length > 0 &&
            typeof args[0] === "object" &&
            args[0] != null &&
            (args[0] as Record<string, unknown>).stream === true;
          if (result instanceof Promise) {
            return result.then((response: unknown) => {
              if (streaming) return wrapAmbientStream(response);
              recordFromContext(response);
              return response;
            });
          }
          return result;
        };
      }
      if (value != null && typeof value === "object" && !Array.isArray(value)) {
        return deepProxy(value as object);
      }
      return value;
    },
  }) as T;
}

function recordFromContext(response: unknown): void {
  try {
    const { userId, feature, runId } = resolveContext();
    if (userId == null) return;
    record(buildEvent(response, { userId, feature: feature ?? "untagged", runId }));
  } catch {
    /* fail-open */
  }
}

// ── Streaming ─────────────────────────────────────────────────

/**
 * Wrap a streaming response (async iterable). Records one event when the
 * stream completes. For OpenAI pass `stream_options: { include_usage: true }`.
 */
export function trackStream<T extends AsyncIterable<unknown>>(stream: T, tags: Tags): T {
  if (!transport || disabled) return stream;
  return wrapStream(stream, tags);
}

function wrapAmbientStream(stream: unknown): unknown {
  const { userId, feature, runId } = resolveContext();
  if (userId == null || stream == null || typeof stream !== "object") return stream;
  if (!(Symbol.asyncIterator in (stream as object))) return stream;
  return wrapStream(stream as AsyncIterable<unknown>, {
    userId,
    feature: feature ?? "untagged",
    runId,
  });
}

function wrapStream<T extends AsyncIterable<unknown>>(stream: T, tags: Tags): T {
  const state = {
    model: "unknown",
    inputTokens: 0,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    done: false,
  };

  const observe = (event: unknown) => {
    try {
      if (event == null || typeof event !== "object") return;
      const record_ = event as Record<string, unknown>;
      if (record_.type === "message_start" && record_.message != null) {
        const message = record_.message as Record<string, unknown>;
        if (typeof message.model === "string") state.model = message.model;
        if (message.usage != null) {
          const usage = usageFromObject(message.usage);
          state.inputTokens = usage.inputTokens;
          state.cacheRead = usage.cacheReadTokens;
          state.cacheWrite = usage.cacheWriteTokens;
        }
      } else if (record_.type === "message_delta" && record_.usage != null) {
        const tokens = (record_.usage as Record<string, unknown>).output_tokens;
        if (typeof tokens === "number") state.outputTokens = tokens;
      } else if ("choices" in record_) {
        if (typeof record_.model === "string") state.model = record_.model;
        if (record_.usage != null) {
          const usage = usageFromObject(record_.usage);
          state.inputTokens = usage.inputTokens;
          state.outputTokens = usage.outputTokens;
          state.cacheRead = usage.cacheReadTokens;
        }
      }
    } catch {
      /* fail-open */
    }
  };

  const finish = () => {
    if (state.done) return;
    state.done = true;
    try {
      if (state.inputTokens === 0 && state.outputTokens === 0) return;
      record(
        buildEventFromUsage(
          {
            inputTokens: state.inputTokens,
            outputTokens: state.outputTokens,
            cacheReadTokens: state.cacheRead,
            cacheWriteTokens: state.cacheWrite,
          },
          state.model,
          tags,
        ),
      );
    } catch {
      /* fail-open */
    }
  };

  return new Proxy(stream, {
    get(obj, prop, receiver) {
      if (prop === Symbol.asyncIterator) {
        return async function* () {
          try {
            for await (const event of obj) {
              observe(event);
              yield event;
            }
          } finally {
            finish();
          }
        };
      }
      const value = Reflect.get(obj, prop, receiver);
      return typeof value === "function" ? value.bind(obj) : value;
    },
  }) as T;
}

// Test hooks (not part of the public API)
export const _internal = {
  setTransport(t: unknown) {
    transport = t as Transport | null;
  },
  resolveContext,
  reset() {
    transport = null;
    disabled = false;
    sampleRate = 1;
    userIdFn = null;
    featureFn = null;
  },
};

// Auto-init when the env var is present
if (process.env.MARGINED_API_KEY) init();
