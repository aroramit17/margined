import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
export type CustomerContext = {
  customerId: string;
  userId?: string;
  feature?: string;
};
export type Usage = {
  id?: string;
  timestamp?: string;
  customerId?: string;
  userId?: string;
  feature?: string;
  provider: "openai" | "anthropic";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  cacheWrite1hTokens?: number;
};
export type Options = {
  apiKey: string;
  endpoint: string;
  flushIntervalMs?: number;
  maxQueueSize?: number;
  onError?: (error: Error) => void;
  fetch?: typeof globalThis.fetch;
};
// Provider-shaped boundaries intentionally avoid a dependency on either SDK version.
type ProviderObject = Record<string, any>;
type WrappedMethod<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : F;
export type ObservedOpenAI<T extends ProviderObject> = Omit<
  T,
  "chat" | "responses"
> & {
  chat: Omit<T["chat"], "completions"> & {
    completions: Omit<T["chat"]["completions"], "create"> & {
      create: WrappedMethod<T["chat"]["completions"]["create"]>;
    };
  };
  responses: Omit<T["responses"], "create"> & {
    create: WrappedMethod<T["responses"]["create"]>;
  };
};
export type ObservedAnthropic<T extends ProviderObject> = Omit<
  T,
  "messages"
> & {
  messages: Omit<T["messages"], "create"> & {
    create: WrappedMethod<T["messages"]["create"]>;
  };
};
export class Inferlytic {
  private context = new AsyncLocalStorage<CustomerContext>();
  private queue: Usage[] = [];
  private pending: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private send: typeof globalThis.fetch;
  private max: number;
  constructor(private options: Options) {
    if (!options.apiKey) throw Error("Inferlytic apiKey is required");
    const url = new URL(options.endpoint);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
    )
      throw Error("Inferlytic endpoint must use HTTPS, except localhost");
    this.send = options.fetch ?? globalThis.fetch;
    this.max = options.maxQueueSize ?? 1000;
    if ((options.flushIntervalMs ?? 5000) > 0) {
      this.timer = setInterval(() => {
        void this.flush().catch(() => {});
      }, options.flushIntervalMs ?? 5000);
      this.timer.unref();
    }
  }
  withCustomer<T>(customer: CustomerContext, fn: () => T): T {
    if (!customer.customerId)
      throw Error("A Stripe customer ID or explicit workspace ID is required");
    return this.context.run({ ...customer }, fn);
  }
  withFeature<T>(feature: string, fn: () => T): T {
    const customer = this.context.getStore();
    if (!customer) throw Error("Call withFeature inside withCustomer");
    return this.context.run({ ...customer, feature }, fn);
  }
  track(usage: Usage): void {
    const context = this.context.getStore();
    const customerId = usage.customerId ?? context?.customerId;
    if (!customerId)
      throw Error("Use withCustomer or pass customerId to track");
    for (const n of [
      usage.inputTokens,
      usage.outputTokens,
      usage.cachedInputTokens ?? 0,
      usage.cacheWriteTokens ?? 0,
      usage.cacheWrite1hTokens ?? 0,
    ])
      if (!Number.isSafeInteger(n) || n < 0)
        throw Error("Token counts must be non-negative integers");
    if (this.queue.length >= this.max) {
      this.report(
        Error("Inferlytic queue full; telemetry event was not queued"),
      );
      return;
    }
    this.queue.push({
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens ?? 0,
      cacheWriteTokens: usage.cacheWriteTokens ?? 0,
      cacheWrite1hTokens: usage.cacheWrite1hTokens ?? 0,
      id: usage.id ?? randomUUID(),
      timestamp: usage.timestamp ?? new Date().toISOString(),
      customerId,
      userId: usage.userId ?? context?.userId,
      feature: usage.feature ?? context?.feature ?? "Untagged",
    });
    if (this.queue.length >= 100) void this.flush().catch(() => {});
  }
  private report(e: Error) {
    try {
      this.options.onError
        ? this.options.onError(e)
        : console.warn("[Inferlytic]", e.message);
    } catch {
      /* instrumentation must not fail the provider call */
    }
  }
  async flush(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.drain();
    try {
      await this.pending;
    } finally {
      this.pending = null;
    }
  }
  private async drain() {
    while (this.queue.length) {
      const batch = this.queue.slice(0, 100);
      try {
        const response = await this.send(this.options.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ events: batch }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw Error(
            `Inferlytic ingestion returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
          );
        this.queue.splice(0, batch.length);
      } catch (e) {
        const error = e instanceof Error ? e : Error(String(e));
        this.report(error);
        throw error;
      }
    }
  }
  async close() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
  get queuedEvents() {
    return this.queue.length;
  }
  private wrapMethod(
    target: ProviderObject,
    provider: "openai" | "anthropic",
    responses = false,
  ) {
    const self = this;
    return new Proxy(target, {
      get(object, key) {
        const value = Reflect.get(object, key);
        if (key !== "create")
          return typeof value === "function" ? value.bind(object) : value;
        return async function (params: ProviderObject, ...rest: unknown[]) {
          if (params.stream)
            throw Error(
              "Inferlytic beta does not support streaming. Use non-streaming or track usage explicitly.",
            );
          if (!self.context.getStore()?.customerId)
            throw Error(
              "Wrap provider requests in telemetry.withCustomer(...)",
            );
          const result = await value.call(object, params, ...rest);
          const u = result.usage;
          if (u) {
            try {
              if (provider === "anthropic") {
                const creation = u.cache_creation;
                const oneHour = creation?.ephemeral_1h_input_tokens ?? 0;
                self.track({
                  provider,
                  model: result.model ?? params.model,
                  inputTokens: u.input_tokens ?? 0,
                  outputTokens: u.output_tokens ?? 0,
                  cachedInputTokens: u.cache_read_input_tokens ?? 0,
                  cacheWriteTokens:
                    creation?.ephemeral_5m_input_tokens ??
                    Math.max(0, (u.cache_creation_input_tokens ?? 0) - oneHour),
                  cacheWrite1hTokens: oneHour,
                });
              } else
                self.track({
                  provider,
                  model: result.model ?? params.model,
                  inputTokens:
                    (responses ? u.input_tokens : u.prompt_tokens) ?? 0,
                  outputTokens:
                    (responses ? u.output_tokens : u.completion_tokens) ?? 0,
                  cachedInputTokens:
                    (responses
                      ? u.input_tokens_details?.cached_tokens
                      : u.prompt_tokens_details?.cached_tokens) ?? 0,
                });
            } catch (e) {
              self.report(e instanceof Error ? e : Error(String(e)));
            }
          } else
            self.report(
              Error(
                "Provider returned no token usage; request was not recorded",
              ),
            );
          return result;
        };
      },
    });
  }
  wrapOpenAI<T extends ProviderObject>(client: T): ObservedOpenAI<T> {
    const chat = new Proxy(client.chat, {
      get: (obj, key) =>
        key === "completions"
          ? this.wrapMethod(obj.completions, "openai")
          : Reflect.get(obj, key),
    });
    return new Proxy(client, {
      get: (obj, key) =>
        key === "chat"
          ? chat
          : key === "responses"
            ? this.wrapMethod(obj.responses, "openai", true)
            : typeof Reflect.get(obj, key) === "function"
              ? (Reflect.get(obj, key) as Function).bind(obj)
              : Reflect.get(obj, key),
    }) as unknown as ObservedOpenAI<T>;
  }
  wrapAnthropic<T extends ProviderObject>(client: T): ObservedAnthropic<T> {
    return new Proxy(client, {
      get: (obj, key) =>
        key === "messages"
          ? this.wrapMethod(obj.messages, "anthropic")
          : typeof Reflect.get(obj, key) === "function"
            ? (Reflect.get(obj, key) as Function).bind(obj)
            : Reflect.get(obj, key),
    }) as unknown as ObservedAnthropic<T>;
  }
}
