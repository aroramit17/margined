/**
 * Usage extraction from provider responses (Anthropic Messages, OpenAI Chat
 * Completions) and event construction. Cache tokens are split out; OpenAI's
 * prompt_tokens INCLUDES cached tokens, so the uncached remainder is stored.
 */

import { computeCost, detectProvider } from "./pricing.js";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface MarginedEvent {
  event_id: string;
  customer_id: string;
  feature: string;
  run_id: string | null;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

function num(obj: unknown, key: string): number {
  if (obj == null || typeof obj !== "object") return 0;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function usageFromObject(usage: unknown): Usage {
  // Anthropic-style
  let inputTokens = num(usage, "input_tokens");
  let outputTokens = num(usage, "output_tokens");
  let cacheRead = num(usage, "cache_read_input_tokens");
  let cacheWrite = num(usage, "cache_creation_input_tokens");

  if (inputTokens === 0 && outputTokens === 0) {
    // OpenAI-style
    const prompt = num(usage, "prompt_tokens");
    const completion = num(usage, "completion_tokens");
    const details = (usage as Record<string, unknown> | null)?.["prompt_tokens_details"];
    const cached = num(details, "cached_tokens");
    inputTokens = Math.max(prompt - cached, 0);
    outputTokens = completion;
    cacheRead = cached;
    cacheWrite = 0;
  }

  return { inputTokens, outputTokens, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite };
}

export function extractUsage(response: unknown): Usage | null {
  if (response == null || typeof response !== "object") return null;
  const usage = (response as Record<string, unknown>).usage;
  if (usage == null) return null;
  return usageFromObject(usage);
}

export interface Tags {
  userId: string;
  feature: string;
  runId?: string | null;
  metadata?: Record<string, unknown>;
}

export function buildEventFromUsage(usage: Usage, model: string, tags: Tags): MarginedEvent {
  return {
    // Idempotency key — the ingest API dedupes on it, so retried flushes
    // can never double-count cost.
    event_id: crypto.randomUUID(),
    customer_id: String(tags.userId),
    feature: String(tags.feature),
    run_id: tags.runId ?? null,
    model,
    provider: detectProvider(model),
    input_tokens: usage.inputTokens,
    output_tokens: usage.outputTokens,
    cache_read_tokens: usage.cacheReadTokens,
    cache_write_tokens: usage.cacheWriteTokens,
    cost_usd: computeCost(
      model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
    ),
    occurred_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    metadata: tags.metadata ?? {},
  };
}

export function buildEvent(response: unknown, tags: Tags): MarginedEvent | null {
  const usage = extractUsage(response);
  if (usage == null) return null;
  const model =
    (response as Record<string, unknown> | null)?.["model"] != null
      ? String((response as Record<string, unknown>)["model"])
      : "unknown";
  return buildEventFromUsage(usage, model, tags);
}
