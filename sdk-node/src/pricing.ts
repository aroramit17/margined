/**
 * Model price table and cost computation.
 *
 * Prices are USD per single token, split into four rates so provider
 * prompt-cache discounts are priced correctly. The table is generated from
 * the server's source of truth (backend/app/pricing.py) — run
 * scripts/check_prices.py in CI to keep all three tables in sync.
 */

import { PRICE_TABLE, PRICES_VERSION as GEN_VERSION } from "./prices.js";

export interface ModelPrice {
  inp: number;
  out: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export const PRICES: Record<string, ModelPrice> = PRICE_TABLE;
export const PRICES_VERSION: string = GEN_VERSION;

const DEFAULT_PRICE: ModelPrice = { inp: 3e-6, out: 15e-6 };

export function resolvePrice(model: string): ModelPrice | undefined {
  if (PRICES[model]) return PRICES[model];
  let stripped = model.split("/").pop() ?? model;
  if (stripped.startsWith("anthropic.")) stripped = stripped.slice("anthropic.".length);
  if (PRICES[stripped]) return PRICES[stripped];
  // Longest-prefix match handles dated snapshots without matching
  // "gpt-4o" for "gpt-4o-mini-…".
  let best: string | undefined;
  for (const key of Object.keys(PRICES)) {
    if (stripped.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? PRICES[best] : undefined;
}

export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const price = resolvePrice(model) ?? DEFAULT_PRICE;
  let cost = price.inp * inputTokens + price.out * outputTokens;
  cost += (price.cacheRead ?? price.inp) * cacheReadTokens;
  cost += (price.cacheWrite ?? price.inp) * cacheWriteTokens;
  return Math.round(cost * 1e10) / 1e10;
}

export function detectProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "anthropic";
  if (/^(gpt|o1|o3|o4|chatgpt)/.test(m)) return "openai";
  if (m.includes("gemini")) return "google";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("mixtral") || m.includes("mistral")) return "mistral";
  if (m.includes("llama") || m.includes("gemma")) return "meta";
  return "unknown";
}
