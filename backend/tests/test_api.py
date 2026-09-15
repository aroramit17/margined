"""Backend unit tests — pure logic + ingest endpoint with mocked DB."""

from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

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
    "occurred_at": datetime.now(timezone.utc).isoformat(),
}


@pytest.fixture
def mock_ingest_db(monkeypatch):
    db = MagicMock()
    db.rpc.return_value.execute.return_value.data = {
        "status": "ok", "accepted": 1, "duplicates": 0,
        "events_used": 1, "events_limit": 100000, "month": "2026-09",
    }
    monkeypatch.setattr(ingest_module, "get_db", lambda: db)
    return db


def post_events(events, **kwargs):
    return client.post("/ingest", json={"events": events},
                       headers={"Authorization": "Bearer mgd_good"}, **kwargs)


class TestIngest:
    def test_valid_batch_is_server_priced_and_acknowledged(self, mock_ingest_db):
        response = post_events([VALID_EVENT])
        assert response.status_code == 202 and response.json()["accepted"] == 1
        name, args = mock_ingest_db.rpc.call_args.args
        assert name == "ingest_event_batch"
        assert args["p_api_key"] == "mgd_good"
        assert float(args["p_events"][0]["cost_usd"]) == pytest.approx(0.0105)
        assert args["p_events"][0]["event_id"] == "evt_abc"
        mock_ingest_db.table.assert_not_called()

    def test_unknown_model_rejected_without_client_cost_fallback(self, mock_ingest_db):
        assert post_events([{**VALID_EVENT, "model": "mystery", "cost_usd": .123}]).status_code == 422
        mock_ingest_db.rpc.assert_not_called()

    def test_invalid_key_is_401(self, mock_ingest_db):
        mock_ingest_db.rpc.return_value.execute.return_value.data = {"status": "invalid_key"}
        assert post_events([VALID_EVENT]).status_code == 401

    def test_missing_auth_is_401(self, mock_ingest_db):
        assert client.post("/ingest", json={"events": [VALID_EVENT]}).status_code == 401
        mock_ingest_db.rpc.assert_not_called()

    @pytest.mark.parametrize("bad", [{"customer_id": "private customer"}, None, 4,
                                      {**VALID_EVENT, "event_id": ""},
                                      {**VALID_EVENT, "event_id": None}])
    def test_invalid_batch_does_not_partially_write(self, mock_ingest_db, bad):
        response = post_events([VALID_EVENT, bad])
        assert response.status_code == 422
        assert "private customer" not in response.text
        mock_ingest_db.rpc.assert_not_called()

    def test_stable_event_id_is_required(self, mock_ingest_db):
        event = {k: v for k, v in VALID_EVENT.items() if k != "event_id"}
        assert post_events([event]).status_code == 422
        mock_ingest_db.rpc.assert_not_called()

    def test_single_event_body_still_supported(self, mock_ingest_db):
        assert client.post("/ingest", json=VALID_EVENT, headers={"Authorization":"Bearer mgd_good"}).status_code == 202

    def test_oversized_batch_is_rejected_not_truncated(self, mock_ingest_db):
        assert post_events([VALID_EVENT] * 101).status_code == 422
        mock_ingest_db.rpc.assert_not_called()

    def test_streamed_body_limit(self, mock_ingest_db):
        response = client.post("/ingest", content=b"x" * (ingest_module.MAX_BODY_BYTES + 1),
                               headers={"Authorization":"Bearer mgd_good", "Content-Length":"1"})
        assert response.status_code == 413
        mock_ingest_db.rpc.assert_not_called()

    def test_malformed_json_is_400(self, mock_ingest_db):
        response = client.post("/ingest", content=b"not json", headers={"Authorization":"Bearer mgd_good"})
        assert response.status_code == 400

    def test_db_failure_is_retryable_and_hides_details(self, mock_ingest_db):
        mock_ingest_db.rpc.side_effect = Exception("private database detail")
        response = post_events([VALID_EVENT])
        assert response.status_code == 503 and response.headers["retry-after"] == "5"
        assert "private" not in response.text
        mock_ingest_db.table.assert_not_called()

    @pytest.mark.parametrize("status", ["quota_exceeded", "rate_limited"])
    def test_database_limit_returns_retry_after(self, mock_ingest_db, status):
        mock_ingest_db.rpc.return_value.execute.return_value.data = {"status":status, "retry_after":60, "accepted":0}
        response = post_events([VALID_EVENT])
        assert response.status_code == 429 and response.headers["retry-after"] == "60"
        assert response.json()["accepted"] == 0

    @pytest.mark.parametrize("timestamp", ["2000-01-01T00:00:00Z", "2099-01-01T00:00:00Z", "2026-09-14T12:00:00"])
    def test_timestamp_requires_timezone_and_supported_window(self, mock_ingest_db, timestamp):
        assert post_events([{**VALID_EVENT, "occurred_at": timestamp}]).status_code == 422
        mock_ingest_db.rpc.assert_not_called()

    def test_missing_rpc_result_fails_closed(self, mock_ingest_db):
        mock_ingest_db.rpc.return_value.execute.return_value.data = None
        assert post_events([VALID_EVENT]).status_code == 503


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


from app.routes import billing as billing_module


def test_billing_status_uses_authoritative_account_counter(monkeypatch):
    db = MagicMock()
    db.rpc.return_value.execute.return_value.data = {"plan":"free", "events_used":42, "events_limit":100000}
    monkeypatch.setattr(billing_module, "get_db", lambda: db)
    assert billing_module.billing_status({"id":"owner"})["events_used"] == 42
    db.rpc.assert_called_once_with("account_usage_status", {"p_user_id":"owner"})
    db.rpc.side_effect = Exception("offline")
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        billing_module.billing_status({"id":"owner"})
    assert exc.value.status_code == 503


class TestBillingWebhook:
    def test_checkout_completed_sets_plan(self, monkeypatch):
        db = MagicMock()
        monkeypatch.setattr(billing_module, "get_db", lambda: db)
        event = {
            "type": "checkout.session.completed",
            "data": {"object": {
                "client_reference_id": "user-1",
                "customer": "cus_x",
                "subscription": "sub_x",
                "metadata": {"user_id": "user-1", "plan": "starter"},
            }},
        }
        with patch("stripe.Webhook.construct_event", return_value=event):
            response = client.post("/billing/webhook", content=b"{}",
                                   headers={"stripe-signature": "sig"})
        assert response.status_code == 200
        upsert = db.table.return_value.upsert.call_args[0][0]
        assert upsert["plan"] == "starter"
        assert upsert["user_id"] == "user-1"

    def test_subscription_deleted_downgrades(self, monkeypatch):
        db = MagicMock()
        monkeypatch.setattr(billing_module, "get_db", lambda: db)
        event = {
            "type": "customer.subscription.deleted",
            "data": {"object": {"customer": "cus_x"}},
        }
        with patch("stripe.Webhook.construct_event", return_value=event):
            response = client.post("/billing/webhook", content=b"{}",
                                   headers={"stripe-signature": "sig"})
        assert response.status_code == 200
        update = db.table.return_value.update.call_args[0][0]
        assert update["plan"] == "free"

    def test_bad_signature_rejected(self):
        with patch("stripe.Webhook.construct_event", side_effect=Exception("bad sig")):
            response = client.post("/billing/webhook", content=b"{}",
                                   headers={"stripe-signature": "bad"})
        assert response.status_code == 400
