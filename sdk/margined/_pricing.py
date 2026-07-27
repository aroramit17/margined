"""
Model price table and cost computation.

Prices are USD per single token (not per 1M), split into four rates:
  in          — uncached input tokens
  out         — output tokens
  cache_read  — input tokens served from provider prompt cache
  cache_write — input tokens written to provider prompt cache

The table is versioned by date. The SDK computes cost locally (no network
round-trip on the hot path); the ingest API recomputes server-side against
its own table and keeps whichever is non-zero, so a stale client table
degrades gracefully.
"""

from __future__ import annotations

from typing import Optional, TypedDict


class ModelPrice(TypedDict, total=False):
    inp: float
    out: float
    cache_read: float
    cache_write: float


PRICES_VERSION = "2026-07-27"

# fmt: off
PRICES: dict[str, ModelPrice] = {
    # ── Anthropic ─────────────────────────────────────────────
    # Cache read = 0.1x input; cache write (5m TTL) = 1.25x input.
    "claude-fable-5":    {"inp": 10e-6,   "out": 50e-6,  "cache_read": 1e-6,     "cache_write": 12.5e-6},
    "claude-mythos-5":   {"inp": 10e-6,   "out": 50e-6,  "cache_read": 1e-6,     "cache_write": 12.5e-6},
    "claude-opus-5":     {"inp": 5e-6,    "out": 25e-6,  "cache_read": 0.5e-6,   "cache_write": 6.25e-6},
    "claude-opus-4-8":   {"inp": 5e-6,    "out": 25e-6,  "cache_read": 0.5e-6,   "cache_write": 6.25e-6},
    "claude-opus-4-7":   {"inp": 5e-6,    "out": 25e-6,  "cache_read": 0.5e-6,   "cache_write": 6.25e-6},
    "claude-opus-4-6":   {"inp": 5e-6,    "out": 25e-6,  "cache_read": 0.5e-6,   "cache_write": 6.25e-6},
    "claude-opus-4-5":   {"inp": 5e-6,    "out": 25e-6,  "cache_read": 0.5e-6,   "cache_write": 6.25e-6},
    "claude-opus-4-1":   {"inp": 15e-6,   "out": 75e-6,  "cache_read": 1.5e-6,   "cache_write": 18.75e-6},
    # Sonnet 5 introductory pricing ($2/$10) runs through 2026-08-31; list is $3/$15.
    "claude-sonnet-5":   {"inp": 2e-6,    "out": 10e-6,  "cache_read": 0.2e-6,   "cache_write": 2.5e-6},
    "claude-sonnet-4-6": {"inp": 3e-6,    "out": 15e-6,  "cache_read": 0.3e-6,   "cache_write": 3.75e-6},
    "claude-sonnet-4-5": {"inp": 3e-6,    "out": 15e-6,  "cache_read": 0.3e-6,   "cache_write": 3.75e-6},
    "claude-sonnet-4-0": {"inp": 3e-6,    "out": 15e-6,  "cache_read": 0.3e-6,   "cache_write": 3.75e-6},
    "claude-haiku-4-5":  {"inp": 1e-6,    "out": 5e-6,   "cache_read": 0.1e-6,   "cache_write": 1.25e-6},
    "claude-3-5-sonnet": {"inp": 3e-6,    "out": 15e-6,  "cache_read": 0.3e-6,   "cache_write": 3.75e-6},
    "claude-3-5-haiku":  {"inp": 0.8e-6,  "out": 4e-6,   "cache_read": 0.08e-6,  "cache_write": 1e-6},

    # ── OpenAI ────────────────────────────────────────────────
    "gpt-5":             {"inp": 1.25e-6, "out": 10e-6,  "cache_read": 0.125e-6},
    "gpt-5-mini":        {"inp": 0.25e-6, "out": 2e-6,   "cache_read": 0.025e-6},
    "gpt-5-nano":        {"inp": 0.05e-6, "out": 0.4e-6, "cache_read": 0.005e-6},
    "gpt-4.1":           {"inp": 2e-6,    "out": 8e-6,   "cache_read": 0.5e-6},
    "gpt-4.1-mini":      {"inp": 0.4e-6,  "out": 1.6e-6, "cache_read": 0.1e-6},
    "gpt-4.1-nano":      {"inp": 0.1e-6,  "out": 0.4e-6, "cache_read": 0.025e-6},
    "gpt-4o":            {"inp": 2.5e-6,  "out": 10e-6,  "cache_read": 1.25e-6},
    "gpt-4o-mini":       {"inp": 0.15e-6, "out": 0.6e-6, "cache_read": 0.075e-6},
    "o3":                {"inp": 2e-6,    "out": 8e-6,   "cache_read": 0.5e-6},
    "o3-mini":           {"inp": 1.1e-6,  "out": 4.4e-6, "cache_read": 0.55e-6},
    "o4-mini":           {"inp": 1.1e-6,  "out": 4.4e-6, "cache_read": 0.275e-6},
    "o1":                {"inp": 15e-6,   "out": 60e-6,  "cache_read": 7.5e-6},
    "gpt-4-turbo":       {"inp": 10e-6,   "out": 30e-6},
    "gpt-3.5-turbo":     {"inp": 0.5e-6,  "out": 1.5e-6},

    # ── Google ────────────────────────────────────────────────
    "gemini-2.5-pro":        {"inp": 1.25e-6, "out": 10e-6,   "cache_read": 0.31e-6},
    "gemini-2.5-flash":      {"inp": 0.3e-6,  "out": 2.5e-6,  "cache_read": 0.075e-6},
    "gemini-2.5-flash-lite": {"inp": 0.1e-6,  "out": 0.4e-6,  "cache_read": 0.025e-6},

    # ── Groq ──────────────────────────────────────────────────
    "llama-3.3-70b-versatile":  {"inp": 0.59e-6, "out": 0.79e-6},
    "llama-3.1-70b-versatile":  {"inp": 0.59e-6, "out": 0.79e-6},
    "llama-3.1-8b-instant":     {"inp": 0.05e-6, "out": 0.08e-6},
    "mixtral-8x7b-32768":       {"inp": 0.24e-6, "out": 0.24e-6},

    # ── Mistral ───────────────────────────────────────────────
    "mistral-large":  {"inp": 2e-6,   "out": 6e-6},
    "mistral-small":  {"inp": 0.1e-6, "out": 0.3e-6},

    # ── DeepSeek ──────────────────────────────────────────────
    "deepseek-chat":     {"inp": 0.27e-6, "out": 1.1e-6, "cache_read": 0.07e-6},
    "deepseek-reasoner": {"inp": 0.55e-6, "out": 2.19e-6, "cache_read": 0.14e-6},

    # ── Together AI ───────────────────────────────────────────
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo": {"inp": 0.88e-6, "out": 0.88e-6},
    "meta-llama/Llama-3.3-70B-Instruct-Turbo":      {"inp": 0.88e-6, "out": 0.88e-6},
    "mistralai/Mixtral-8x7B-Instruct-v0.1":         {"inp": 0.6e-6,  "out": 0.6e-6},
}
# fmt: on

# Unknown model fallback: mid-tier pricing so cost is a plausible estimate
# rather than zero. Events also carry raw token counts, so the server can
# re-price once the model lands in its table.
_DEFAULT_PRICE: ModelPrice = {"inp": 3e-6, "out": 15e-6}


def resolve_price(model: str) -> Optional[ModelPrice]:
    """Look up a model's price, tolerating date suffixes and provider prefixes."""
    if model in PRICES:
        return PRICES[model]
    # Strip provider prefixes like "anthropic.claude-opus-5" or "openai/gpt-4o"
    stripped = model.split("/")[-1]
    if stripped.startswith("anthropic."):
        stripped = stripped[len("anthropic."):]
    if stripped in PRICES:
        return PRICES[stripped]
    # Longest-prefix match handles dated snapshots ("claude-haiku-4-5-20251001",
    # "gpt-4o-2024-08-06") without matching "gpt-4o" to "gpt-4o-mini".
    best: Optional[str] = None
    for key in PRICES:
        if stripped.startswith(key) and (best is None or len(key) > len(best)):
            best = key
    return PRICES[best] if best else None


def compute_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> float:
    """Compute USD cost for one call. Cache-aware when rates are known.

    `input_tokens` must be the *uncached* count — callers subtract cached
    tokens before passing (see _extract).
    """
    price = resolve_price(model) or _DEFAULT_PRICE
    cost = price.get("inp", 0.0) * input_tokens + price.get("out", 0.0) * output_tokens
    cost += price.get("cache_read", price.get("inp", 0.0)) * cache_read_tokens
    cost += price.get("cache_write", price.get("inp", 0.0)) * cache_write_tokens
    return round(cost, 10)


def detect_provider(model: str) -> str:
    m = model.lower()
    if "claude" in m:
        return "anthropic"
    if m.startswith(("gpt", "o1", "o3", "o4", "chatgpt")):
        return "openai"
    if "gemini" in m:
        return "google"
    if "deepseek" in m:
        return "deepseek"
    if "mixtral" in m or "mistral" in m:
        return "mistral"
    if "llama" in m or "gemma" in m:
        return "meta"
    return "unknown"
