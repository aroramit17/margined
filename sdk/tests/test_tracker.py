"""Unit tests for the Margined SDK."""

import pytest
from unittest.mock import MagicMock, patch
import margined


def make_anthropic_response(model="claude-sonnet-4-6", input_tokens=100, output_tokens=50):
    response = MagicMock()
    response.model = model
    response.usage = MagicMock()
    response.usage.input_tokens = input_tokens
    response.usage.output_tokens = output_tokens
    del response.usage.prompt_tokens
    del response.usage.completion_tokens
    return response


def make_openai_response(model="gpt-4o", prompt_tokens=100, completion_tokens=50):
    response = MagicMock()
    response.model = model
    response.usage = MagicMock()
    response.usage.prompt_tokens = prompt_tokens
    response.usage.completion_tokens = completion_tokens
    del response.usage.input_tokens
    del response.usage.output_tokens
    return response


# ── Cost computation ───────────────────────────────────────────────────────────

class TestComputeCost:
    def test_claude_sonnet_known_price(self):
        cost = margined._compute_cost("claude-sonnet-4-6", 1000, 500)
        assert cost == round(0.000003 * 1000 + 0.000015 * 500, 8)

    def test_gpt4o_known_price(self):
        cost = margined._compute_cost("gpt-4o", 1000, 500)
        assert cost == round(0.0000025 * 1000 + 0.000010 * 500, 8)

    def test_unknown_model_uses_default(self):
        cost = margined._compute_cost("some-unknown-model", 1000, 500)
        assert cost > 0

    def test_zero_tokens(self):
        assert margined._compute_cost("gpt-4o", 0, 0) == 0.0


# ── Provider detection ─────────────────────────────────────────────────────────

class TestDetectProvider:
    def test_claude(self):
        assert margined._detect_provider("claude-sonnet-4-6") == "anthropic"

    def test_gpt(self):
        assert margined._detect_provider("gpt-4o") == "openai"

    def test_llama(self):
        assert margined._detect_provider("llama-3.1-70b") == "together"

    def test_unknown(self):
        assert margined._detect_provider("some-model") == "unknown"


# ── Event extraction ───────────────────────────────────────────────────────────

class TestExtractEvent:
    def test_anthropic_response(self):
        resp = make_anthropic_response()
        event = margined._extract_event(resp, "user_123", "summarize", None, None)
        assert event["customer_id"] == "user_123"
        assert event["feature"] == "summarize"
        assert event["model"] == "claude-sonnet-4-6"
        assert event["provider"] == "anthropic"
        assert event["input_tokens"] == 100
        assert event["output_tokens"] == 50
        assert event["cost_usd"] > 0
        assert "occurred_at" in event

    def test_no_usage_returns_none(self):
        resp = MagicMock()
        resp.usage = None
        assert margined._extract_event(resp, "u", "f", None, None) is None

    def test_metadata_passed_through(self):
        resp = make_anthropic_response()
        event = margined._extract_event(resp, "u", "f", "run_1", {"plan": "starter"})
        assert event["metadata"]["plan"] == "starter"
        assert event["run_id"] == "run_1"


# ── Explicit track() wrapper ───────────────────────────────────────────────────

class TestTrack:
    def setup_method(self):
        margined._api_key = "test-key"
        margined._queue.clear()

    def teardown_method(self):
        margined._api_key = None
        margined._queue.clear()

    def test_returns_response_unchanged(self):
        resp = make_anthropic_response()
        assert margined.track(resp, user_id="u1", feature="test") is resp

    def test_queues_event(self):
        resp = make_anthropic_response()
        margined.track(resp, user_id="u1", feature="test")
        assert len(margined._queue) == 1
        assert margined._queue[0]["customer_id"] == "u1"

    def test_no_api_key_does_not_queue(self):
        margined._api_key = None
        margined.track(make_anthropic_response(), user_id="u1", feature="test")
        assert len(margined._queue) == 0

    def test_exception_does_not_raise(self):
        result = margined.track(None, user_id="u", feature="f")
        assert result is None


# ── Context / auto-patch mode ──────────────────────────────────────────────────

class TestContext:
    def setup_method(self):
        margined._api_key = "test-key"
        margined._queue.clear()
        margined._user_id_fn = None
        margined._feature_fn = None
        margined._ctx_user_id.set(None)
        margined._ctx_feature.set(None)

    def teardown_method(self):
        margined._api_key = None
        margined._queue.clear()
        margined._user_id_fn = None
        margined._feature_fn = None

    def test_set_context_static(self):
        margined.set_context(user_id="static_user", feature="static_feat")
        uid, feat = margined._resolve_context()
        assert uid == "static_user"
        assert feat == "static_feat"

    def test_set_context_callable(self):
        margined.set_context(user_id=lambda: "dynamic_user", feature=lambda: "dynamic_feat")
        uid, feat = margined._resolve_context()
        assert uid == "dynamic_user"
        assert feat == "dynamic_feat"

    def test_record_from_context_queues_event(self):
        margined.set_context(user_id="ctx_user", feature="ctx_feat")
        resp = make_anthropic_response()
        margined._record_from_context(resp)
        assert len(margined._queue) == 1
        assert margined._queue[0]["customer_id"] == "ctx_user"
        assert margined._queue[0]["feature"] == "ctx_feat"

    def test_record_from_context_no_user_skips(self):
        # No context set — should not queue
        margined._record_from_context(make_anthropic_response())
        assert len(margined._queue) == 0

    def test_context_callable_exception_does_not_raise(self):
        def bad():
            raise RuntimeError("db is down")
        margined.set_context(user_id=bad)
        uid, _ = margined._resolve_context()
        assert uid is None  # graceful fallback


# ── run() context manager ──────────────────────────────────────────────────────

class TestRunContextManager:
    def setup_method(self):
        margined._api_key = "test-key"
        margined._queue.clear()
        margined._ctx_user_id.set(None)
        margined._ctx_feature.set(None)

    def teardown_method(self):
        margined._api_key = None
        margined._queue.clear()

    def test_sets_context_vars_inside_block(self):
        with margined.run(user_id="run_user", feature="run_feat"):
            uid, feat = margined._resolve_context()
            assert uid == "run_user"
            assert feat == "run_feat"

    def test_resets_context_vars_after_block(self):
        with margined.run(user_id="run_user", feature="run_feat"):
            pass
        uid, feat = margined._resolve_context()
        assert uid is None
        assert feat is None

    def test_tag_updates_metadata(self):
        r = margined.run(user_id="u", feature="f")
        r.tag({"steps": 3})
        assert r.metadata["steps"] == 3


# ── Flush ──────────────────────────────────────────────────────────────────────

class TestFlush:
    def setup_method(self):
        margined._api_key = "test-key"
        margined._queue.clear()

    def teardown_method(self):
        margined._api_key = None
        margined._queue.clear()

    def test_flush_clears_queue(self):
        margined.track(make_anthropic_response(), user_id="u1", feature="test")
        assert len(margined._queue) == 1
        with patch("httpx.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=202)
            margined.flush()
        assert len(margined._queue) == 0

    def test_flush_empty_queue_does_not_call_http(self):
        with patch("httpx.post") as mock_post:
            margined.flush()
        mock_post.assert_not_called()

    def test_flush_http_error_does_not_raise(self):
        margined.track(make_anthropic_response(), user_id="u1", feature="test")
        with patch("httpx.post", side_effect=Exception("network error")):
            margined.flush()  # must not raise
