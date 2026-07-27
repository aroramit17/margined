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


def main() -> int:
    errors = []

    if SDK_VERSION != API_VERSION:
        errors.append(f"version mismatch: sdk={SDK_VERSION} backend={API_VERSION}")

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
