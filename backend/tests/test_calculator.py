"""Calculator usage counts come from customer totals, independently of costs."""

from unittest.mock import MagicMock

from app.routes import calculator


def test_p99_calls_aggregate_customers_and_rank_independently_of_cost(monkeypatch):
    rows = []
    plans = []
    for i in range(101):
        # Two daily rows per customer; high call counts have low costs.
        rows.extend([
            {"customer_id": str(i), "total_calls": 100, "total_cost": 101 - i},
            {"customer_id": str(i), "total_calls": i, "total_cost": 0},
        ])
        plans.append({"customer_id": str(i), "current_mrr_usd": 299, "plan_name": "Pro"})
    rollups = MagicMock()
    rollups.select.return_value.eq.return_value.gte.return_value.lte.return_value.execute.return_value.data = rows
    stripe = MagicMock()
    stripe.select.return_value.eq.return_value.execute.return_value.data = plans
    db = MagicMock()
    db.table.side_effect = {"daily_rollups": rollups, "stripe_customers": stripe}.__getitem__
    monkeypatch.setattr(calculator, "get_db", lambda: db)

    result = calculator.pricing_calculator("project", {}, {}, target_margin=0.7)
    tier = result.model_dump()["tiers"][0]
    assert tier["customer_count"] == 101
    assert tier["median_calls"] == 150
    assert tier["p90_calls"] == 190
    assert tier["p99_calls"] == 199
    assert tier["p99_cogs"] == 100
