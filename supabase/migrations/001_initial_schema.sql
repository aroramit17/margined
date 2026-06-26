-- Margined — Initial Schema
-- Run via: supabase db push

-- ──────────────────────────────────────────────
-- Projects
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users NOT NULL,
  name        TEXT NOT NULL,
  api_key     TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own projects"
  ON projects FOR ALL
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────
-- LLM Events (append-only, high volume)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS llm_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects NOT NULL,
  customer_id   TEXT NOT NULL,
  feature       TEXT NOT NULL,
  run_id        TEXT,
  model         TEXT NOT NULL,
  provider      TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      NUMERIC(10,8) NOT NULL,
  metadata      JSONB DEFAULT '{}',
  occurred_at   TIMESTAMPTZ NOT NULL
);

-- Dashboard queries hit these indexes
CREATE INDEX IF NOT EXISTS idx_events_project_customer
  ON llm_events (project_id, customer_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_project_feature
  ON llm_events (project_id, feature, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_project_date
  ON llm_events (project_id, occurred_at DESC);

-- Service role only — SDK writes via service role key
ALTER TABLE llm_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can insert events"
  ON llm_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can read their project events"
  ON llm_events FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────
-- Stripe Customer Map
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_customers (
  project_id      UUID REFERENCES projects NOT NULL,
  customer_id     TEXT NOT NULL,
  stripe_customer TEXT NOT NULL,
  current_mrr_usd NUMERIC(8,2),
  plan_name       TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, customer_id)
);

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their stripe customer maps"
  ON stripe_customers FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────
-- Alert Configurations
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_configs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID REFERENCES projects NOT NULL,
  alert_type     TEXT NOT NULL
    CHECK (alert_type IN ('margin_threshold', 'feature_spend', 'bill_forecast')),
  threshold      NUMERIC NOT NULL,
  channel        TEXT NOT NULL
    CHECK (channel IN ('email', 'slack')),
  destination    TEXT NOT NULL,
  last_fired_at  TIMESTAMPTZ,
  enabled        BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE alert_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own alert configs"
  ON alert_configs FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- ──────────────────────────────────────────────
-- Daily Rollups (pre-aggregated, written by edge function)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_rollups (
  project_id    UUID REFERENCES projects NOT NULL,
  date          DATE NOT NULL,
  customer_id   TEXT NOT NULL,
  feature       TEXT NOT NULL,
  total_calls   INTEGER NOT NULL DEFAULT 0,
  total_cost    NUMERIC(10,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, date, customer_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_rollups_project_date
  ON daily_rollups (project_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_rollups_project_customer
  ON daily_rollups (project_id, customer_id, date DESC);

ALTER TABLE daily_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can write rollups"
  ON daily_rollups FOR ALL
  TO service_role
  USING (true);

CREATE POLICY "Users can read their project rollups"
  ON daily_rollups FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );
