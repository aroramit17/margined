/**
 * Background event transport: bounded queue, batching, retry with backoff.
 * Fail-open: never throws into the host app, never blocks the event loop
 * beyond a queue push, drops data before degrading the app.
 */

import type { MarginedEvent } from "./extract.js";

const MAX_QUEUE = 10_000;
const MAX_BATCH = 100;
const FLUSH_INTERVAL_MS = 5_000;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 10_000;

export class Transport {
  private queue: Array<MarginedEvent & { _retried?: boolean }> = [];
  private dropped = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> | null = null;
  private stopped = false;
  private draining = false;

  constructor(
    readonly apiKey: string,
    readonly endpoint: string,
    readonly debug = false,
  ) {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    // Never keep the process alive just for telemetry.
    if (typeof this.timer.unref === "function") this.timer.unref();
    process.once("beforeExit", () => void this.shutdown());
  }

  enqueue(event: MarginedEvent): void {
    if (this.stopped) return;
    if (this.queue.length >= MAX_QUEUE) {
      this.queue.shift();
      this.dropped++;
    }
    this.queue.push(event);
    if (this.queue.length >= MAX_BATCH) void this.flush();
  }

  /** Drain the queue. Concurrent calls coalesce onto one in-flight drain. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, MAX_BATCH);
      const dropped = this.dropped;
      this.dropped = 0;
      const payload: Record<string, unknown> = { events: batch };
      if (dropped > 0) payload.dropped = dropped;
      const ok = await this.send(payload, batch);
      if (!ok) return; // endpoint unhealthy — let the next interval retry
    }
  }

  private async send(
    payload: Record<string, unknown>,
    batch: Array<MarginedEvent & { _retried?: boolean }>,
  ): Promise<boolean> {
    const attempts = this.draining ? 1 : MAX_RETRIES;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status < 500) {
          if (this.debug && response.status >= 400) {
            console.warn(`margined: ingest rejected batch (${response.status})`);
          }
          return true; // 2xx accepted; 4xx won't improve on retry — drop
        }
      } catch (error) {
        if (this.debug) console.warn(`margined: flush attempt ${attempt + 1} failed`, error);
      }
      if (attempt + 1 < attempts) {
        await sleep(2 ** attempt * 500 + Math.random() * 250);
      }
    }
    if (this.draining) {
      this.dropped += batch.length;
      return false;
    }
    // Requeue at most once so a transient outage doesn't eat data but a
    // dead endpoint doesn't loop forever.
    if (this.queue.length + batch.length <= MAX_QUEUE && !batch.some((e) => e._retried)) {
      for (const event of batch) event._retried = true;
      this.queue.push(...batch);
    } else {
      this.dropped += batch.length;
    }
    return false;
  }

  async shutdown(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.draining = true;
    if (this.timer) clearInterval(this.timer);
    try {
      await this.flush();
    } catch {
      /* fail-open */
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
