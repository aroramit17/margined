#!/usr/bin/env python3
"""
Verify the SDK and backend price tables agree.

The same model priced differently client- and server-side would make the
dashboard silently disagree with the SDK's local estimates. Run in CI.

    python scripts/check_prices.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "sdk"))
sys.path.insert(0, str(ROOT / "backend"))

from margined._pricing import PRICES as SDK_PRICES, PRICES_VERSION as SDK_VERSION  # noqa: E402
from app.pricing import PRICES as API_PRICES, PRICES_VERSION as API_VERSION  # noqa: E402


def parse_node_table() -> tuple[str, dict]:
    """Parse the generated sdk-node/src/prices.ts (regular structure)."""
    import re

    text = (ROOT / "sdk-node" / "src" / "prices.ts").read_text()
    version = re.search(r'PRICES_VERSION = "([^"]+)"', text).group(1)
    prices = {}
    for match in re.finditer(r'"([^"]+)": \{ ([^}]+) \},', text):
        model, body = match.groups()
        entry = {}
        for pair in body.split(", "):
            key, value = pair.split(": ")
            entry[key] = float(value)
        prices[model] = entry
    return version, prices


def main() -> int:
    errors = []

    if SDK_VERSION != API_VERSION:
        errors.append(f"version mismatch: sdk={SDK_VERSION} backend={API_VERSION}")

    node_version, node_prices = parse_node_table()
    if node_version != API_VERSION:
        errors.append(f"version mismatch: node={node_version} backend={API_VERSION}")
    for model, (inp, out, cache_read, cache_write) in API_PRICES.items():
        node = node_prices.get(model)
        if node is None:
            errors.append(f"missing in node sdk: {model}")
            continue
        expected = {"inp": inp, "out": out}
        if cache_read is not None:
            expected["cacheRead"] = cache_read
        if cache_write is not None:
            expected["cacheWrite"] = cache_write
        if node != expected:
            errors.append(f"node mismatch for {model}: {node} != {expected}")
    for model in node_prices:
        if model not in API_PRICES:
            errors.append(f"extra in node sdk: {model}")

    sdk_models = set(SDK_PRICES)
    api_models = set(API_PRICES)
    for model in sorted(sdk_models - api_models):
        errors.append(f"missing in backend: {model}")
    for model in sorted(api_models - sdk_models):
        errors.append(f"missing in sdk: {model}")

    for model in sorted(sdk_models & api_models):
        sdk = SDK_PRICES[model]
        inp, out, cache_read, cache_write = API_PRICES[model]
        pairs = [
            ("inp", sdk.get("inp"), inp),
            ("out", sdk.get("out"), out),
            ("cache_read", sdk.get("cache_read"), cache_read),
            ("cache_write", sdk.get("cache_write"), cache_write),
        ]
        for name, sdk_value, api_value in pairs:
            if sdk_value is None and api_value is None:
                continue
            if sdk_value != api_value:
                errors.append(f"{model}.{name}: sdk={sdk_value} backend={api_value}")

    if errors:
        print(f"Price tables OUT OF SYNC ({len(errors)} issues):")
        for error in errors:
            print(f"  - {error}")
        return 1

    print(f"Price tables in sync: {len(sdk_models)} models, version {SDK_VERSION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
