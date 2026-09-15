import { z } from "zod";
// Standard global text-token rates in USD / 1M tokens. Versioned snapshot, 2026-09-14.
// https://developers.openai.com/api/docs/pricing
// https://platform.claude.com/docs/en/about-claude/pricing
export const PRICING_VERSION = "2026-09-14";
export const rates: Record<
  string,
  {
    provider: "openai" | "anthropic";
    input: number;
    output: number;
    cached: number;
    write5?: number;
    write60?: number;
  }
> = {
  "gpt-4.1": { provider: "openai", input: 2, output: 8, cached: 0.5 },
  "gpt-4.1-mini": { provider: "openai", input: 0.4, output: 1.6, cached: 0.1 },
  "gpt-4.1-nano": {
    provider: "openai",
    input: 0.1,
    output: 0.4,
    cached: 0.025,
  },
  "gpt-4o": { provider: "openai", input: 2.5, output: 10, cached: 1.25 },
  "gpt-4o-mini": {
    provider: "openai",
    input: 0.15,
    output: 0.6,
    cached: 0.075,
  },
  "claude-sonnet-4-6": {
    provider: "anthropic",
    input: 3,
    output: 15,
    cached: 0.3,
    write5: 3.75,
    write60: 6,
  },
  "claude-sonnet-4-5": {
    provider: "anthropic",
    input: 3,
    output: 15,
    cached: 0.3,
    write5: 3.75,
    write60: 6,
  },
  "claude-haiku-4-5": {
    provider: "anthropic",
    input: 1,
    output: 5,
    cached: 0.1,
    write5: 1.25,
    write60: 2,
  },
  "claude-sonnet-5": {
    provider: "anthropic",
    input: 2,
    output: 10,
    cached: 0.2,
    write5: 2.5,
    write60: 4,
  },
};
const tokens = z.number().int().min(0).max(100_000_000);
export const eventSchema = z
  .object({
    id: z.string().uuid(),
    customerId: z.string().min(1).max(200),
    userId: z.string().max(200).optional(),
    feature: z.string().min(1).max(100).default("Untagged"),
    provider: z.enum(["openai", "anthropic"]),
    model: z.string().min(1).max(100),
    inputTokens: tokens,
    outputTokens: tokens,
    cachedInputTokens: tokens.default(0),
    cacheWriteTokens: tokens.default(0),
    cacheWrite1hTokens: tokens.default(0),
    timestamp: z.iso
      .datetime()
      .refine(
        (v) =>
          Date.parse(v) <= Date.now() + 300000 &&
          Date.parse(v) >= Date.now() - 90 * 86400000,
        "Timestamp must be within the last 90 days",
      ),
  })
  .strict();
export type UsageEvent = z.infer<typeof eventSchema>;
export function priceEvent(e: UsageEvent) {
  const model = e.model
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
    .replace(/-\d{8}$/, "");
  const r = rates[model];
  if (!r || r.provider !== e.provider)
    throw Error(
      `Unsupported model/provider: ${e.provider}/${e.model}. Add a verified rate before ingestion.`,
    );
  if (
    e.provider === "openai" &&
    (e.cachedInputTokens > e.inputTokens ||
      e.cacheWriteTokens ||
      e.cacheWrite1hTokens)
  )
    throw Error("Invalid OpenAI cache token counts");
  if (
    model === "claude-sonnet-4-5" &&
    e.inputTokens +
      e.cachedInputTokens +
      e.cacheWriteTokens +
      e.cacheWrite1hTokens >
      200000
  )
    throw Error(
      "Long-context Sonnet 4.5 pricing is not supported by this catalog",
    );
  const input =
    e.provider === "openai"
      ? e.inputTokens - e.cachedInputTokens
      : e.inputTokens;
  return (
    Math.round(
      (input * r.input +
        e.outputTokens * r.output +
        e.cachedInputTokens * r.cached +
        e.cacheWriteTokens * (r.write5 ?? 0) +
        e.cacheWrite1hTokens * (r.write60 ?? 0)) *
        1e3,
    ) / 1e9
  );
}
