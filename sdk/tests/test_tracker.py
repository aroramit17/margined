"""Unit tests for the Margined SDK."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

import margined
from margined import _transport
from margined._pricing import PRICES, compute_cost, detect_provider, resolve_price
from margined._extract import build_event, usage_from_obj
from margined._stream import TrackedStream, _StreamState


def make_anthropic_response(model="claude-sonnet-4-6", input_tokens=100, output_tokens=50,
                            cache_read=0, cache_write=0):
    usage = SimpleNamespace(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cache_read_input_tokens=cache_read,
        cache_creation_input_tokens=cache_write,
    )
    return SimpleNamespace(model=model, usage=usage)


def make_openai_response(model="gpt-4o", prompt_tokens=100, completion_tokens=50, cached=0):
    usage = SimpleNamespace(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        prompt_tokens_details=SimpleNamespace(cached_tokens=cached),
        input_tokens=None,
        output_tokens=None,
        cache_read_input_tokens=None,
        cache_creation_input_tokens=None,
    )
    return SimpleNamespace(model=model, usage=usage)


class FakeTransport:
    """Stands in for the HTTP transport; records enqueued events."""

    api_key = "test"
    endpoint = "http://test"

    def __init__(self):
        self.events = []

    def enqueue(self, event):
        self.events.append(event)

    def flush(self):
        pass

    def shutdown(self):
        pass


@pytest.fixture
def fake_transport(monkeypatch):
    transport = FakeTransport()
    monkeypatch.setattr(margined, "_client", transport)
    monkeypatch.setattr(margined, "_disabled", False)
    monkeypatch.setattr(margined, "_sample_rate", 1.0)
    return transport


# ── Pricing ────────────────────────────────────────────────────────────────

class TestPricing:
    def test_sonnet_known_price(self):
        assert compute_cost("claude-sonnet-4-6", 1000, 500) == pytest.approx(
            1000 * 3e-6 + 500 * 15e-6
        )

    def test_gpt4o_known_price(self):
        assert compute_cost("gpt-4o", 1000, 500) == pytest.approx(1000 * 2.5e-6 + 500 * 10e-6)

    def test_cache_tokens_priced_at_discount(self):
        # 10k uncached in, 2k out, 5k cache read, 1k cache write on Opus 5
        cost = compute_cost("claude-opus-5", 10_000, 2_000, 5_000, 1_000)
        expected = 10_000 * 5e-6 + 2_000 * 25e-6 + 5_000 * 0.5e-6 + 1_000 * 6.25e-6
        assert cost == pytest.approx(expected)

    def test_dated_snapshot_resolves_by_prefix(self):
        assert resolve_price("claude-haiku-4-5-20251001") == PRICES["claude-haiku-4-5"]
        assert resolve_price("gpt-4o-2024-08-06") == PRICES["gpt-4o"]

    def test_prefix_match_prefers_longest(self):
        # "gpt-4o-mini-2024" must match gpt-4o-mini, not gpt-4o
        assert resolve_price("gpt-4o-mini-2024-07-18") == PRICES["gpt-4o-mini"]

    def test_provider_prefixes_stripped(self):
        assert resolve_price("anthropic.claude-opus-5") == PRICES["claude-opus-5"]
        assert resolve_price("openai/gpt-4o") == PRICES["gpt-4o"]

    def test_unknown_model_uses_fallback(self):
        assert compute_cost("totally-unknown-model", 1000, 500) > 0

    def test_zero_tokens(self):
        assert compute_cost("gpt-4o", 0, 0) == 0.0


class TestDetectProvider:
    def test_known_providers(self):
        assert detect_provider("claude-sonnet-4-6") == "anthropic"
        assert detect_provider("gpt-4o") == "openai"
        assert detect_provider("o4-mini") == "openai"
        assert detect_provider("gemini-2.5-pro") == "google"
        assert detect_provider("deepseek-chat") == "deepseek"
        assert detect_provider("llama-3.3-70b-versatile") == "meta"

    def test_unknown(self):
        assert detect_provider("some-model") == "unknown"


# ── Usage extraction ───────────────────────────────────────────────────────

class TestExtract:
    def test_anthropic_response(self):
        event = build_event(make_anthropic_response(), "user_123", "summarize")
        assert event["customer_id"] == "user_123"
        assert event["feature"] == "summarize"
        assert event["model"] == "claude-sonnet-4-6"
        assert event["provider"] == "anthropic"
        assert event["input_tokens"] == 100
        assert event["output_tokens"] == 50
        assert event["cost_usd"] > 0
        assert event["event_id"]
        assert "occurred_at" in event

    def test_anthropic_cache_tokens(self):
        response = make_anthropic_response(input_tokens=100, cache_read=900, cache_write=50)
        event = build_event(response, "u", "f")
        assert event["cache_read_tokens"] == 900
        assert event["cache_write_tokens"] == 50

    def test_openai_cached_tokens_subtracted_from_input(self):
        # prompt_tokens includes cached tokens; event input must be the uncached remainder
        response = make_openai_response(prompt_tokens=1000, cached=800)
        event = build_event(response, "u", "f")
        assert event["input_tokens"] == 200
        assert event["cache_read_tokens"] == 800

    def test_no_usage_returns_none(self):
        assert build_event(SimpleNamespace(usage=None), "u", "f") is None

    def test_metadata_and_run_id_pass_through(self):
        event = build_event(make_anthropic_response(), "u", "f", "run_1", {"plan": "starter"})
        assert event["metadata"]["plan"] == "starter"
        assert event["run_id"] == "run_1"

    def test_event_ids_unique(self):
        e1 = build_event(make_anthropic_response(), "u", "f")
        e2 = build_event(make_anthropic_response(), "u", "f")
        assert e1["event_id"] != e2["event_id"]

    def test_dict_usage(self):
        usage = usage_from_obj({"input_tokens": 10, "output_tokens": 5})
        assert usage["input_tokens"] == 10 and usage["output_tokens"] == 5


# ── track() ────────────────────────────────────────────────────────────────

class TestTrack:
    def test_returns_response_unchanged(self, fake_transport):
        response = make_anthropic_response()
        assert margined.track(response, user_id="u1", feature="test") is response

    def test_queues_event(self, fake_transport):
        margined.track(make_anthropic_response(), user_id="u1", feature="test")
        assert len(fake_transport.events) == 1
        assert fake_transport.events[0]["customer_id"] == "u1"

    def test_uninitialized_does_not_queue(self, monkeypatch):
        monkeypatch.setattr(margined, "_client", None)
        response = make_anthropic_response()
        assert margined.track(response, user_id="u1", feature="t") is response

    def test_disabled_does_not_queue(self, fake_transport, monkeypatch):
        monkeypatch.setattr(margined, "_disabled", True)
        margined.track(make_anthropic_response(), user_id="u1", feature="t")
        assert fake_transport.events == []

    def test_bad_response_does_not_raise(self, fake_transport):
        assert margined.track(None, user_id="u", feature="f") is None
        assert margined.track(object(), user_id="u", feature="f") is not None

    def test_sampling_zero_drops_everything(self, fake_transport, monkeypatch):
        monkeypatch.setattr(margined, "_sample_rate", 0.0)
        for _ in range(20):
            margined.track(make_anthropic_response(), user_id="u", feature="f")
        assert fake_transport.events == []


# ── Context / auto-patch mode ──────────────────────────────────────────────

class TestContext:
    @pytest.fixture(autouse=True)
    def reset_context(self, monkeypatch):
        monkeypatch.setattr(margined, "_user_id_fn", None)
        monkeypatch.setattr(margined, "_feature_fn", None)
        margined._ctx_user_id.set(None)
        margined._ctx_feature.set(None)
        margined._ctx_run_id.set(None)

    def test_set_context_static(self):
        margined.set_context(user_id="static_user", feature="static_feat")
        assert margined._resolve_context() == ("static_user", "static_feat")

    def test_set_context_callable(self):
        margined.set_context(user_id=lambda: "dyn_user", feature=lambda: "dyn_feat")
        assert margined._resolve_context() == ("dyn_user", "dyn_feat")

    def test_callable_exception_falls_back_to_none(self):
        def bad():
            raise RuntimeError("db down")

        margined.set_context(user_id=bad)
        user_id, _ = margined._resolve_context()
        assert user_id is None

    def test_record_from_context_queues(self, fake_transport):
        margined.set_context(user_id="ctx_user", feature="ctx_feat")
        margined._record_from_context(make_anthropic_response())
        assert fake_transport.events[0]["customer_id"] == "ctx_user"
        assert fake_transport.events[0]["feature"] == "ctx_feat"

    def test_record_without_user_skips(self, fake_transport):
        margined._record_from_context(make_anthropic_response())
        assert fake_transport.events == []

    def test_identify_scopes_user(self, fake_transport):
        with margined.identify("scoped_user"):
            margined._record_from_context(make_anthropic_response())
        margined._record_from_context(make_anthropic_response())
        assert len(fake_transport.events) == 1
        assert fake_transport.events[0]["customer_id"] == "scoped_user"

    def test_feature_decorator(self, fake_transport):
        @margined.feature("tagged_feature")
        def do_call():
            with margined.identify("u9"):
                margined._record_from_context(make_anthropic_response())

        do_call()
        assert fake_transport.events[0]["feature"] == "tagged_feature"


# ── run() context manager ──────────────────────────────────────────────────

class TestRun:
    @pytest.fixture(autouse=True)
    def reset_context(self):
        margined._ctx_user_id.set(None)
        margined._ctx_feature.set(None)
        margined._ctx_run_id.set(None)

    def test_sets_and_resets_context(self):
        with margined.run(user_id="run_user", feature="run_feat") as r:
            assert margined._resolve_context() == ("run_user", "run_feat")
            assert margined._ctx_run_id.get() == r.run_id
        assert margined._resolve_context() == (None, None)
        assert margined._ctx_run_id.get() is None

    def test_track_inherits_run_id(self, fake_transport):
        with margined.run(user_id="u", feature="agent") as r:
            margined.track(make_anthropic_response(), user_id="u", feature="agent")
        assert fake_transport.events[0]["run_id"] == r.run_id

    def test_run_ids_unique(self):
        assert margined.run(user_id="u", feature="f").run_id != margined.run(
            user_id="u", feature="f"
        ).run_id

    def test_tag_updates_metadata(self):
        r = margined.run(user_id="u", feature="f")
        r.tag({"steps": 3})
        assert r.metadata["steps"] == 3


# ── Streaming ──────────────────────────────────────────────────────────────

def make_anthropic_stream_events():
    start_usage = SimpleNamespace(
        input_tokens=120, output_tokens=1,
        cache_read_input_tokens=40, cache_creation_input_tokens=0,
    )
    return [
        SimpleNamespace(type="message_start",
                        message=SimpleNamespace(model="claude-sonnet-4-6", usage=start_usage)),
        SimpleNamespace(type="content_block_delta"),
        SimpleNamespace(type="message_delta", usage=SimpleNamespace(output_tokens=77)),
        SimpleNamespace(type="message_stop"),
    ]


class TestStreaming:
    def test_anthropic_stream_records_final_usage(self, fake_transport):
        stream = margined.track_stream(iter(make_anthropic_stream_events()),
                                       user_id="u", feature="chat")
        consumed = list(stream)
        assert len(consumed) == 4
        event = fake_transport.events[0]
        assert event["model"] == "claude-sonnet-4-6"
        assert event["input_tokens"] == 120
        assert event["output_tokens"] == 77
        assert event["cache_read_tokens"] == 40

    def test_openai_stream_records_usage_chunk(self, fake_transport):
        chunks = [
            SimpleNamespace(model="gpt-4o", choices=[SimpleNamespace()], usage=None),
            SimpleNamespace(
                model="gpt-4o", choices=[],
                usage=SimpleNamespace(
                    prompt_tokens=200, completion_tokens=30,
                    prompt_tokens_details=SimpleNamespace(cached_tokens=100),
                    input_tokens=None, output_tokens=None,
                ),
            ),
        ]
        list(margined.track_stream(iter(chunks), user_id="u", feature="chat"))
        event = fake_transport.events[0]
        assert event["input_tokens"] == 100
        assert event["cache_read_tokens"] == 100
        assert event["output_tokens"] == 30

    def test_stream_with_no_usage_records_nothing(self, fake_transport):
        list(margined.track_stream(iter([SimpleNamespace(type="noop")]),
                                   user_id="u", feature="f"))
        assert fake_transport.events == []

    def test_finish_only_records_once(self, fake_transport):
        state = _StreamState("u", "f", None, None, margined._record)
        for event in make_anthropic_stream_events():
            state.observe(event)
        state.finish()
        state.finish()
        assert len(fake_transport.events) == 1

    def test_uninitialized_returns_stream_unwrapped(self, monkeypatch):
        monkeypatch.setattr(margined, "_client", None)
        raw = iter([])
        assert margined.track_stream(raw, user_id="u", feature="f") is raw


# ── Transport ──────────────────────────────────────────────────────────────

class TestTransport:
    def make_transport(self):
        with patch.object(_transport.Transport, "_run"), patch.object(_transport.atexit, "register"):
            transport = _transport.Transport("key", "http://x/ingest")
        transport._client = MagicMock()  # never hit the network in tests
        transport._client.post.return_value = MagicMock(status_code=202)
        return transport

    def test_flush_sends_batch_and_clears(self):
        transport = self.make_transport()
        transport.enqueue({"a": 1})
        mock_client = MagicMock()
        mock_client.post.return_value = MagicMock(status_code=202)
        transport._client = mock_client
        transport.flush()
        assert len(transport._queue) == 0
        assert mock_client.post.call_count == 1

    def test_flush_empty_queue_no_http(self):
        transport = self.make_transport()
        mock_client = MagicMock()
        transport._client = mock_client
        transport.flush()
        mock_client.post.assert_not_called()

    def test_network_error_requeues_once(self):
        transport = self.make_transport()
        transport.enqueue({"a": 1})
        mock_client = MagicMock()
        mock_client.post.side_effect = Exception("network down")
        transport._client = mock_client
        with patch.object(_transport.time, "sleep"):
            transport.flush()
        # requeued once with _retried marker
        assert len(transport._queue) == 1
        assert transport._queue[0]["_retried"] is True
        with patch.object(_transport.time, "sleep"):
            transport.flush()
        # second failure: dropped, not requeued forever
        assert len(transport._queue) == 0
        assert transport._dropped == 1

    def test_4xx_drops_without_retry(self):
        transport = self.make_transport()
        transport.enqueue({"a": 1})
        mock_client = MagicMock()
        mock_client.post.return_value = MagicMock(status_code=401)
        transport._client = mock_client
        transport.flush()
        assert mock_client.post.call_count == 1
        assert len(transport._queue) == 0

    def test_queue_bounded(self):
        transport = self.make_transport()
        for i in range(_transport._MAX_QUEUE + 500):
            transport.enqueue({"i": i})
        assert len(transport._queue) == _transport._MAX_QUEUE
        assert transport._dropped == 500


@pytest.mark.parametrize("status", [429, 503])
def test_transport_honors_retry_after_with_stable_event_id(status):
    transport = TestTransport().make_transport()
    transport.enqueue({"event_id": "stable-id"})
    transport._client.post.side_effect = [
        MagicMock(status_code=status, headers={"retry-after":"10"}),
        MagicMock(status_code=202),
    ]
    with patch.object(_transport.time, "time", return_value=100):
        transport.flush(); transport.flush()
        assert transport._client.post.call_count == 1
    with patch.object(_transport.time, "time", return_value=111):
        transport.flush()
    assert transport._client.post.call_count == 2
    for call in transport._client.post.call_args_list:
        assert call.kwargs["json"]["events"][0]["event_id"] == "stable-id"
    assert len(transport._queue) == 0


def test_long_retry_after_does_not_block_shutdown():
    transport = TestTransport().make_transport()
    transport.enqueue({"event_id":"stable-id"})
    transport._client.post.return_value = MagicMock(status_code=429, headers={"retry-after":"86400"})
    transport.flush()
    transport.shutdown()
    assert transport._client.post.call_count == 1


def test_retryable_http_failure_without_retry_after_uses_backoff():
    transport = TestTransport().make_transport()
    transport.enqueue({"event_id":"stable-id"})
    transport._client.post.side_effect = [MagicMock(status_code=503, headers={}), MagicMock(status_code=202)]
    with patch.object(_transport.time, "sleep") as sleep:
        transport.flush()
    sleep.assert_called_once()
    assert transport._client.post.call_count == 2
