-- Margined — event idempotency + cache-aware token accounting
-- Run via: supabase db push

-- SDK sends a client-generated event_id per call; a retried flush after a
-- network failure must never double-count cost.
ALTER TABLE llm_events ADD COLUMN IF NOT EXISTS event_id TEXT;

-- Provider prompt-cache tokens are billed at different rates than raw input.
ALTER TABLE llm_events ADD COLUMN IF NOT EXISTS cache_read_tokens  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE llm_events ADD COLUMN IF NOT EXISTS cache_write_tokens INTEGER NOT NULL DEFAULT 0;

-- Dedup constraint: unique per project when event_id is present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_project_event_id
  ON llm_events (project_id, event_id)
  WHERE event_id IS NOT NULL;
