"""
Server-side model price table.

Mirrors sdk/margined/_pricing.py. The ingest endpoint recomputes cost from
raw token counts whenever it can resolve the model, so a stale or tampered
client-side cost never poisons the dashboard. Keep this file in sync with
the SDK table (see scripts/check_prices.py).
"""

from __future__ import annotations

from typing import Optional

PRICES_VERSION = "2026-07-27"

# USD per token: (input, output, cache_read, cache_write). None = unknown rate
# (falls back to input rate for cache tokens).
# fmt: off
PRICES: dict[str, tuple[float, float, Optional[float], Optional[float]]] = {
    # Anthropic
    "claude-fable-5":    (10e-6, 50e-6, 1e-6, 12.5e-6),
    "claude-mythos-5":   (10e-6, 50e-6, 1e-6, 12.5e-6),
    "claude-opus-5":     (5e-6, 25e-6, 0.5e-6, 6.25e-6),
    "claude-opus-4-8":   (5e-6, 25e-6, 0.5e-6, 6.25e-6),
    "claude-opus-4-7":   (5e-6, 25e-6, 0.5e-6, 6.25e-6),
    "claude-opus-4-6":   (5e-6, 25e-6, 0.5e-6, 6.25e-6),
    "claude-opus-4-5":   (5e-6, 25e-6, 0.5e-6, 6.25e-6),
    "claude-opus-4-1":   (15e-6, 75e-6, 1.5e-6, 18.75e-6),
    "claude-sonnet-5":   (2e-6, 10e-6, 0.2e-6, 2.5e-6),   # intro pricing through 2026-08-31
    "claude-sonnet-4-6": (3e-6, 15e-6, 0.3e-6, 3.75e-6),
    "claude-sonnet-4-5": (3e-6, 15e-6, 0.3e-6, 3.75e-6),
    "claude-sonnet-4-0": (3e-6, 15e-6, 0.3e-6, 3.75e-6),
    "claude-haiku-4-5":  (1e-6, 5e-6, 0.1e-6, 1.25e-6),
    "claude-3-5-sonnet": (3e-6, 15e-6, 0.3e-6, 3.75e-6),
    "claude-3-5-haiku":  (0.8e-6, 4e-6, 0.08e-6, 1e-6),
    # OpenAI
    "gpt-5":        (1.25e-6, 10e-6, 0.125e-6, None),
    "gpt-5-mini":   (0.25e-6, 2e-6, 0.025e-6, None),
    "gpt-5-nano":   (0.05e-6, 0.4e-6, 0.005e-6, None),
    "gpt-4.1":      (2e-6, 8e-6, 0.5e-6, None),
    "gpt-4.1-mini": (0.4e-6, 1.6e-6, 0.1e-6, None),
    "gpt-4.1-nano": (0.1e-6, 0.4e-6, 0.025e-6, None),
    "gpt-4o":       (2.5e-6, 10e-6, 1.25e-6, None),
    "gpt-4o-mini":  (0.15e-6, 0.6e-6, 0.075e-6, None),
    "o3":           (2e-6, 8e-6, 0.5e-6, None),
    "o3-mini":      (1.1e-6, 4.4e-6, 0.55e-6, None),
    "o4-mini":      (1.1e-6, 4.4e-6, 0.275e-6, None),
    "o1":           (15e-6, 60e-6, 7.5e-6, None),
    "gpt-4-turbo":  (10e-6, 30e-6, None, None),
    "gpt-3.5-turbo": (0.5e-6, 1.5e-6, None, None),
    # Google
    "gemini-2.5-pro":        (1.25e-6, 10e-6, 0.31e-6, None),
    "gemini-2.5-flash":      (0.3e-6, 2.5e-6, 0.075e-6, None),
    "gemini-2.5-flash-lite": (0.1e-6, 0.4e-6, 0.025e-6, None),
    # Groq
    "llama-3.3-70b-versatile": (0.59e-6, 0.79e-6, None, None),
    "llama-3.1-70b-versatile": (0.59e-6, 0.79e-6, None, None),
    "llama-3.1-8b-instant":    (0.05e-6, 0.08e-6, None, None),
    "mixtral-8x7b-32768":      (0.24e-6, 0.24e-6, None, None),
    # Mistral
    "mistral-large": (2e-6, 6e-6, None, None),
    "mistral-small": (0.1e-6, 0.3e-6, None, None),
    # DeepSeek
    "deepseek-chat":     (0.27e-6, 1.1e-6, 0.07e-6, None),
    "deepseek-reasoner": (0.55e-6, 2.19e-6, 0.14e-6, None),
    # Together
    "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo": (0.88e-6, 0.88e-6, None, None),
    "meta-llama/Llama-3.3-70B-Instruct-Turbo":      (0.88e-6, 0.88e-6, None, None),
    "mistralai/Mixtral-8x7B-Instruct-v0.1":         (0.6e-6, 0.6e-6, None, None),
}
# fmt: on


def _resolve(model: str) -> Optional[tuple[float, float, Optional[float], Optional[float]]]:
    if model in PRICES:
        return PRICES[model]
    stripped = model.split("/")[-1]
    if stripped.startswith("anthropic."):
        stripped = stripped[len("anthropic."):]
    if stripped in PRICES:
        return PRICES[stripped]
    best = None
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
) -> Optional[float]:
    """Server-side cost from raw token counts. None when the model is unknown."""
    price = _resolve(model)
    if price is None:
        return None
    inp, out, cache_read, cache_write = price
    cost = inp * input_tokens + out * output_tokens
    cost += (cache_read if cache_read is not None else inp) * cache_read_tokens
    cost += (cache_write if cache_write is not None else inp) * cache_write_tokens
    return round(cost, 10)
