-- Margined — billing accounts + usage metering
-- Run via: supabase db push

-- One billing account per auth user. Plan gates event volume and features.
CREATE TABLE IF NOT EXISTS billing_accounts (
  user_id             UUID PRIMARY KEY REFERENCES auth.users,
  plan                TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'starter', 'growth')),
  stripe_customer     TEXT UNIQUE,
  stripe_subscription TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own billing account"
  ON billing_accounts FOR SELECT
  USING (auth.uid() = user_id);

-- Monthly event counters per project (fast limit checks at ingest).
CREATE TABLE IF NOT EXISTS usage_counters (
  project_id  UUID REFERENCES projects NOT NULL,
  month       TEXT NOT NULL,             -- "2026-07"
  events      BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, month)
);

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their project usage"
  ON usage_counters FOR SELECT
  USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Atomic increment used by the ingest path (service role).
CREATE OR REPLACE FUNCTION increment_usage(p_project_id UUID, p_month TEXT, p_count BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_total BIGINT;
BEGIN
  INSERT INTO usage_counters (project_id, month, events)
  VALUES (p_project_id, p_month, p_count)
  ON CONFLICT (project_id, month)
  DO UPDATE SET events = usage_counters.events + EXCLUDED.events
  RETURNING events INTO new_total;
  RETURN new_total;
END;
$$;
