"""
Background event transport: bounded queue, batching, retry with backoff.

Guarantees:
  - Never raises into the host application.
  - Never blocks the calling thread (enqueue is O(1); the queue is bounded
    and drops the oldest events under sustained backpressure).
  - Flushes on interval, on batch-size threshold, on manual flush(), and
    at interpreter exit.
"""

from __future__ import annotations

import atexit
import logging
import os
import random
import threading
import time
from collections import deque
from typing import Any, Optional

import httpx

logger = logging.getLogger("margined")

_MAX_QUEUE = 10_000
_MAX_BATCH = 100
_FLUSH_INTERVAL = 5.0
_MAX_RETRIES = 3
_TIMEOUT = 10.0


class Transport:
    def __init__(self, api_key: str, endpoint: str, debug: bool = False):
        self.api_key = api_key
        self.endpoint = endpoint
        self.debug = debug
        self._queue: deque[dict[str, Any]] = deque(maxlen=_MAX_QUEUE)
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stopped = False
        self._draining = False
        self._dropped = 0
        self._client: Optional[httpx.Client] = None
        self._thread = threading.Thread(
            target=self._run, name="margined-flush", daemon=True
        )
        self._thread.start()
        atexit.register(self.shutdown)

    # ── enqueue ───────────────────────────────────────────────

    def enqueue(self, event: dict[str, Any]) -> None:
        with self._lock:
            if len(self._queue) == self._queue.maxlen:
                self._dropped += 1
            self._queue.append(event)
            pending = len(self._queue)
        if pending >= _MAX_BATCH:
            self._wake.set()

    # ── flush loop ────────────────────────────────────────────

    def _run(self) -> None:
        while not self._stopped:
            self._wake.wait(timeout=_FLUSH_INTERVAL)
            self._wake.clear()
            try:
                self.flush()
            except Exception:  # never die
                logger.debug("margined: flush loop error", exc_info=self.debug)

    def flush(self) -> None:
        """Drain the queue synchronously. Safe to call from any thread."""
        while True:
            with self._lock:
                if not self._queue:
                    return
                batch = [self._queue.popleft() for _ in range(min(_MAX_BATCH, len(self._queue)))]
                dropped, self._dropped = self._dropped, 0
            payload: dict[str, Any] = {"events": batch}
            if dropped:
                payload["dropped"] = dropped
            if not self._send(payload, batch):
                return  # endpoint unhealthy — let the next interval retry

    def _send(self, payload: dict[str, Any], batch: list[dict[str, Any]]) -> bool:
        """Send one batch. Returns False when the endpoint looks unhealthy."""
        # During shutdown drain, one best-effort attempt — never delay exit.
        attempts = 1 if self._draining else _MAX_RETRIES
        for attempt in range(attempts):
            try:
                resp = self._get_client().post(self.endpoint, json=payload)
                if resp.status_code < 500:
                    if self.debug and resp.status_code >= 400:
                        logger.warning("margined: ingest rejected batch: %s", resp.status_code)
                    return True  # 2xx accepted; 4xx will not improve on retry — drop
            except Exception:
                if self.debug:
                    logger.warning("margined: flush attempt %d failed", attempt + 1, exc_info=True)
            if attempt + 1 < attempts:
                time.sleep((2**attempt) * 0.5 + random.random() * 0.25)
        if self._draining:
            with self._lock:
                self._dropped += len(batch)
            return False
        # All retries failed: requeue at most once so a transient outage
        # doesn't silently eat data, but a dead endpoint doesn't loop forever.
        with self._lock:
            if len(self._queue) + len(batch) <= _MAX_QUEUE and not any(
                e.get("_retried") for e in batch
            ):
                for e in batch:
                    e["_retried"] = True
                self._queue.extend(batch)
            else:
                self._dropped += len(batch)
        return False

    def _get_client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                timeout=_TIMEOUT,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": _user_agent(),
                },
            )
        return self._client

    # ── shutdown ──────────────────────────────────────────────

    def shutdown(self) -> None:
        if self._stopped:
            return
        self._stopped = True
        self._draining = True
        self._wake.set()
        try:
            self.flush()
        except Exception:
            pass
        if self._client is not None:
            try:
                self._client.close()
            except Exception:
                pass


def _user_agent() -> str:
    from . import __version__

    return f"margined-python/{__version__}"


def debug_enabled() -> bool:
    return os.environ.get("MARGINED_DEBUG", "").lower() in ("1", "true", "yes")
