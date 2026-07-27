#!/usr/bin/env python3
"""Regenerate sdk-node/src/prices.ts from backend/app/pricing.py."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.pricing import PRICES, PRICES_VERSION  # noqa: E402


def main() -> None:
    lines = [
        "// GENERATED from backend/app/pricing.py — do not edit by hand.",
        "// Regenerate: python scripts/gen_node_prices.py",
        'import type { ModelPrice } from "./pricing.js";',
        "",
        f'export const PRICES_VERSION = "{PRICES_VERSION}";',
        "",
        "export const PRICE_TABLE: Record<string, ModelPrice> = {",
    ]
    for model, (inp, out, cache_read, cache_write) in PRICES.items():
        parts = [f"inp: {inp!r}", f"out: {out!r}"]
        if cache_read is not None:
            parts.append(f"cacheRead: {cache_read!r}")
        if cache_write is not None:
            parts.append(f"cacheWrite: {cache_write!r}")
        lines.append(f'  "{model}": {{ {", ".join(parts)} }},')
    lines.append("};")
    (ROOT / "sdk-node" / "src" / "prices.ts").write_text("\n".join(lines) + "\n")
    print(f"wrote {len(PRICES)} models (version {PRICES_VERSION})")


if __name__ == "__main__":
    main()
