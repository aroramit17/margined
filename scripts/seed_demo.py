#!/usr/bin/env python3
"""
Seed a Margined project with realistic demo data.

Generates 45 days of LLM events for a fictional AI-SaaS ("Briefly — AI
meeting summaries"): 24 customers across 3 plan tiers, 5 features, a
power-law usage distribution (a few heavy users dominate cost), and a mix
of models. Posts them through the public /ingest endpoint so the entire
pipeline (validation, server-side pricing, dedup, rollups) is exercised.

Usage:
    python scripts/seed_demo.py --api-key mgd_... [--endpoint http://localhost:8000/ingest]

Optionally seeds Stripe customer mappings directly (margin column lights up):
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python scripts/seed_demo.py \
        --api-key mgd_... --project-id <uuid> --seed-stripe
"""

import argparse
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

import httpx

FEATURES = {
    # feature: (weight, model mix [(model, weight)], tokens_in range, tokens_out range)
    "meeting_summary":   (0.40, [("claude-sonnet-4-6", 0.8), ("claude-haiku-4-5", 0.2)], (2_000, 12_000), (400, 1_500)),
    "action_items":      (0.25, [("claude-haiku-4-5", 1.0)], (1_500, 6_000), (150, 500)),
    "research_agent":    (0.10, [("claude-opus-5", 0.6), ("claude-sonnet-4-6", 0.4)], (8_000, 40_000), (1_000, 6_000)),
    "chat_assistant":    (0.20, [("gpt-4o-mini", 0.7), ("claude-haiku-4-5", 0.3)], (500, 4_000), (100, 800)),
    "weekly_digest":     (0.05, [("claude-sonnet-4-6", 1.0)], (10_000, 30_000), (800, 2_500)),
}

PLANS = [
    ("Starter", 29.0, 8),   # (name, mrr, customer count)
    ("Growth", 99.0, 10),
    ("Scale", 299.0, 6),
]

NAMES = [
    "acme", "globex", "initech", "umbrella", "stark", "wayne", "hooli",
    "piedpiper", "dunder", "wonka", "cyberdyne", "tyrell", "oscorp",
    "massive", "soylent", "vandelay", "bluth", "sterling", "prestige",
    "gringotts", "monarch", "aviato", "raviga", "endframe",
]


def pick_weighted(pairs):
    total = sum(w for _, w in pairs)
    r = random.uniform(0, total)
    acc = 0.0
    for value, w in pairs:
        acc += w
        if r <= acc:
            return value
    return pairs[-1][0]


def build_customers():
    customers = []
    i = 0
    for plan, mrr, count in PLANS:
        for _ in range(count):
            # Power-law activity: most customers light, a few heavy
            activity = random.paretovariate(1.7)
            customers.append({
                "id": f"user_{NAMES[i % len(NAMES)]}_{i}",
                "plan": plan,
                "mrr": mrr,
                "activity": activity,
            })
            i += 1
    # Make one Starter customer pathologically heavy — the demo's margin-alert star
    customers[2]["activity"] = 14.0
    return customers


def generate_events(customers, days=45):
    now = datetime.now(timezone.utc)
    events = []
    feature_pairs = [(f, spec[0]) for f, spec in FEATURES.items()]
    for day_offset in range(days, -1, -1):
        day = now - timedelta(days=day_offset)
        # Mild growth trend + weekday seasonality
        growth = 1.0 + (days - day_offset) / days * 0.8
        weekday_factor = 0.55 if day.weekday() >= 5 else 1.0
        for customer in customers:
            expected_calls = customer["activity"] * 3.0 * growth * weekday_factor
            calls = max(0, int(random.gauss(expected_calls, expected_calls * 0.35)))
            for _ in range(min(calls, 60)):
                feature = pick_weighted(feature_pairs)
                _, model_mix, in_range, out_range = FEATURES[feature]
                model = pick_weighted(model_mix)
                input_tokens = random.randint(*in_range)
                output_tokens = random.randint(*out_range)
                cache_read = int(input_tokens * random.uniform(0, 0.5)) if random.random() < 0.4 else 0
                occurred = day.replace(
                    hour=random.randint(8, 23), minute=random.randint(0, 59),
                    second=random.randint(0, 59), microsecond=0,
                )
                events.append({
                    "event_id": str(uuid.uuid4()),
                    "customer_id": customer["id"],
                    "feature": feature,
                    "model": model,
                    "provider": "anthropic" if "claude" in model else "openai",
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cache_read_tokens": cache_read,
                    "cache_write_tokens": 0,
                    "cost_usd": 0,  # server recomputes
                    "occurred_at": occurred.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "metadata": {"plan": customer["plan"], "demo": True},
                })
    return events


def post_events(events, api_key, endpoint):
    sent = 0
    with httpx.Client(timeout=30.0, headers={"Authorization": f"Bearer {api_key}"}) as client:
        for i in range(0, len(events), 100):
            batch = events[i:i + 100]
            response = client.post(endpoint, json={"events": batch})
            if response.status_code >= 300:
                print(f"  batch {i // 100}: HTTP {response.status_code}", file=sys.stderr)
            sent += len(batch)
            if sent % 2000 < 100:
                print(f"  sent {sent}/{len(events)} events")
    return sent


def seed_stripe(customers, project_id):
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping Stripe seed",
              file=sys.stderr)
        return
    db = create_client(url, key)
    rows = [{
        "project_id": project_id,
        "customer_id": customer["id"],
        "stripe_customer": f"cus_demo_{customer['id']}",
        "current_mrr_usd": customer["mrr"],
        "plan_name": customer["plan"],
    } for customer in customers]
    db.table("stripe_customers").upsert(rows).execute()
    print(f"Seeded {len(rows)} Stripe customer mappings")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-key", required=True, help="Project API key (mgd_...)")
    parser.add_argument("--endpoint", default="http://localhost:8000/ingest")
    parser.add_argument("--days", type=int, default=45)
    parser.add_argument("--seed", type=int, default=42, help="RNG seed (reproducible demos)")
    parser.add_argument("--project-id", help="Project UUID (needed for --seed-stripe)")
    parser.add_argument("--seed-stripe", action="store_true",
                        help="Also seed stripe_customers directly via service role")
    args = parser.parse_args()

    random.seed(args.seed)
    customers = build_customers()
    print(f"Generating {args.days} days of events for {len(customers)} customers…")
    events = generate_events(customers, days=args.days)
    print(f"Posting {len(events)} events to {args.endpoint}")
    sent = post_events(events, args.api_key, args.endpoint)
    print(f"Done: {sent} events sent.")

    if args.seed_stripe:
        if not args.project_id:
            print("--seed-stripe requires --project-id", file=sys.stderr)
            sys.exit(1)
        seed_stripe(customers, args.project_id)

    print("\nNext: trigger the rollup (supabase functions invoke hourly-rollup) "
          "and open the dashboard.")


if __name__ == "__main__":
    main()
