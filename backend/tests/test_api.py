"""Backend unit tests — pure logic + ingest endpoint with mocked DB."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app import pricing
from app.main import app
from app.routes import ingest as ingest_module
from app.routes.customers import _compute_margin, _margin_status
from app.routes.stripe_routes import _mrr_from_subscription

client = TestClient(app)


# ── Pricing ────────────────────────────────────────────────────────────────

class TestServerPricing:
    def test_known_model(self):
        assert pricing.compute_cost("claude-sonnet-4-6", 1000, 500) == pytest.approx(
            1000 * 3e-6 + 500 * 15e-6
        )

    def test_cache_rates_applied(self):
        cost = pricing.compute_cost("claude-opus-5", 1000, 100, 9000, 500)
        expected = 1000 * 5e-6 + 100 * 25e-6 + 9000 * 0.5e-6 + 500 * 6.25e-6
        assert cost == pytest.approx(expected)

    def test_unknown_model_returns_none(self):
        assert pricing.compute_cost("mystery-model-9000", 1000, 500) is None

    def test_dated_snapshot_prefix_match(self):
        assert pricing.compute_cost("claude-haiku-4-5-20251001", 1000, 0) == pytest.approx(
            1000 * 1e-6
        )


# ── Margin math ────────────────────────────────────────────────────────────

class TestMarginMath:
    def test_margin_computation(self):
        assert _compute_margin(100.0, 20.0) == pytest.approx(0.8)

    def test_negative_margin(self):
        assert _compute_margin(49.0, 60.0) < 0

    def test_no_mrr_returns_none(self):
        assert _compute_margin(None, 20.0) is None
        assert _compute_margin(0, 20.0) is None

    def test_status_thresholds(self):
        assert _margin_status(0.9) == "ok"
        assert _margin_status(0.5) == "watch"
        assert _margin_status(0.1) == "risk"
        assert _margin_status(-0.5) == "risk"
        assert _margin_status(None) == "ok"


# ── Stripe MRR normalization ───────────────────────────────────────────────

def make_sub(unit_amount, interval, quantity=1, interval_count=1, nickname="Pro"):
    return {
        "items": {
            "data": [
                {
                    "quantity": quantity,
                    "price": {
                        "unit_amount": unit_amount,
                        "nickname": nickname,
                        "product": "prod_x",
                        "recurring": {"interval": interval, "interval_count": interval_count},
                    },
                }
            ]
        }
    }


class TestMRR:
    def test_monthly_price(self):
        mrr, plan = _mrr_from_subscription(make_sub(4900, "month"))
        assert mrr == 49.0
        assert plan == "Pro"

    def test_yearly_price_normalized(self):
        mrr, _ = _mrr_from_subscription(make_sub(120000, "year"))
        assert mrr == pytest.approx(100.0)

    def test_quantity_multiplies(self):
        mrr, _ = _mrr_from_subscription(make_sub(1000, "month", quantity=5))
        assert mrr == 50.0

    def test_non_recurring_ignored(self):
        sub = {"items": {"data": [{"quantity": 1, "price": {"unit_amount": 5000, "recurring": None, "nickname": None, "product": None}}]}}
        mrr, _ = _mrr_from_subscription(sub)
        assert mrr == 0.0


# ── Ingest endpoint ────────────────────────────────────────────────────────

VALID_EVENT = {
    "customer_id": "user_1",
    "feature": "chat",
    "event_id": "evt_abc",
    "model": "claude-sonnet-4-6",
    "provider": "anthropic",
    "input_tokens": 1000,
    "output_tokens": 500,
    "cost_usd": 999.0,  # bogus client cost — server must recompute
    "occurred_at": "2026-07-27T12:00:00Z",
}


@pytest.fixture
def mock_ingest_db(monkeypatch):
    """Patch project lookup + DB; return the mock table for inspection."""
    ingest_module._key_cache.clear()
    ingest_module._rate_windows.clear()
    monkeypatch.setattr(
        ingest_module, "get_project_by_api_key", lambda key: {"id": "proj-1"} if key == "mgd_good" else None
    )
    db = MagicMock()
    monkeypatch.setattr(ingest_module, "get_db", lambda: db)
    return db


class TestIngest:
    def test_valid_batch_inserts_with_recomputed_cost(self, mock_ingest_db):
        response = client.post(
            "/ingest",
            json={"events": [VALID_EVENT]},
            headers={"Authorization": "Bearer mgd_good"},
        )
        assert response.status_code == 202
        upsert_args = mock_ingest_db.table.return_value.upsert.call_args
        rows = upsert_args[0][0]
        assert len(rows) == 1
        # server-side price wins over the bogus client cost
        expected = 1000 * 3e-6 + 500 * 15e-6
        assert float(rows[0]["cost_usd"]) == pytest.approx(expected)
        assert rows[0]["event_id"] == "evt_abc"
        assert upsert_args[1]["on_conflict"] == "project_id,event_id"

    def test_unknown_model_keeps_client_cost(self, mock_ingest_db):
        event = {**VALID_EVENT, "model": "mystery-model", "cost_usd": 0.123}
        client.post("/ingest", json={"events": [event]},
                    headers={"Authorization": "Bearer mgd_good"})
        rows = mock_ingest_db.table.return_value.upsert.call_args[0][0]
        assert float(rows[0]["cost_usd"]) == pytest.approx(0.123)

    def test_bad_api_key_returns_202_no_insert(self, mock_ingest_db):
        response = client.post("/ingest", json={"events": [VALID_EVENT]},
                               headers={"Authorization": "Bearer mgd_bad"})
        assert response.status_code == 202
        mock_ingest_db.table.assert_not_called()

    def test_missing_auth_returns_202(self, mock_ingest_db):
        assert client.post("/ingest", json={"events": [VALID_EVENT]}).status_code == 202
        mock_ingest_db.table.assert_not_called()

    def test_invalid_events_skipped(self, mock_ingest_db):
        bad = {"customer_id": "u"}  # missing everything
        client.post("/ingest", json={"events": [bad, VALID_EVENT]},
                    headers={"Authorization": "Bearer mgd_good"})
        rows = mock_ingest_db.table.return_value.upsert.call_args[0][0]
        assert len(rows) == 1

    def test_single_event_body_accepted(self, mock_ingest_db):
        client.post("/ingest", json=VALID_EVENT,
                    headers={"Authorization": "Bearer mgd_good"})
        rows = mock_ingest_db.table.return_value.upsert.call_args[0][0]
        assert rows[0]["customer_id"] == "user_1"

    def test_batch_capped_at_100(self, mock_ingest_db):
        events = [{**VALID_EVENT, "event_id": f"evt_{i}"} for i in range(150)]
        client.post("/ingest", json={"events": events},
                    headers={"Authorization": "Bearer mgd_good"})
        rows = mock_ingest_db.table.return_value.upsert.call_args[0][0]
        assert len(rows) == 100

    def test_rate_limit_kicks_in(self, mock_ingest_db):
        for _ in range(ingest_module._RATE_LIMIT):
            assert not ingest_module._rate_limited("key-x")
        assert ingest_module._rate_limited("key-x")

    def test_malformed_json_returns_202(self, mock_ingest_db):
        response = client.post("/ingest", content=b"not json",
                               headers={"Authorization": "Bearer mgd_good",
                                        "Content-Type": "application/json"})
        assert response.status_code == 202

    def test_db_failure_still_202(self, mock_ingest_db):
        mock_ingest_db.table.return_value.upsert.side_effect = Exception("db down")
        mock_ingest_db.table.return_value.insert.side_effect = Exception("db down")
        response = client.post("/ingest", json={"events": [VALID_EVENT]},
                               headers={"Authorization": "Bearer mgd_good"})
        assert response.status_code == 202


# ── Health ─────────────────────────────────────────────────────────────────

def test_health():
    assert client.get("/health").json() == {"status": "ok"}
