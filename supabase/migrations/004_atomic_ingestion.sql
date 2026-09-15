-- Deploy with the hardened API; pause old ingest workers during this migration.
DROP INDEX public.idx_events_project_event_id;
CREATE UNIQUE INDEX idx_events_project_event_id ON public.llm_events(project_id, event_id);
ALTER TABLE public.llm_events ALTER COLUMN cost_usd TYPE NUMERIC(20,10);

CREATE TABLE public.event_receipts (
  project_id UUID NOT NULL REFERENCES public.projects,
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 1 AND 64),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, event_id)
);
-- Preserve existing idempotency IDs; legacy events without IDs cannot be deduped.
INSERT INTO public.event_receipts(project_id, event_id)
  SELECT project_id, event_id FROM public.llm_events
  WHERE event_id IS NOT NULL AND length(event_id) BETWEEN 1 AND 64;
ALTER TABLE public.event_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.account_usage_counters (
  user_id UUID NOT NULL REFERENCES auth.users,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  events BIGINT NOT NULL DEFAULT 0 CHECK (events >= 0),
  PRIMARY KEY (user_id, month)
);
-- Keep recorded historical usage. occurred_at cannot reconstruct ingestion month.
INSERT INTO public.account_usage_counters(user_id, month, events)
  SELECT p.user_id, u.month, sum(greatest(u.events, 0))
  FROM public.usage_counters u JOIN public.projects p ON p.id = u.project_id
  WHERE u.month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  GROUP BY p.user_id, u.month;
ALTER TABLE public.account_usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can read account usage" ON public.account_usage_counters
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.ingest_rate_windows (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  window_start TIMESTAMPTZ NOT NULL,
  requests INTEGER NOT NULL CHECK (requests > 0)
);
ALTER TABLE public.ingest_rate_windows ENABLE ROW LEVEL SECURITY;

-- Retire the nontransactional increment path, including service-role access.
ALTER FUNCTION public.increment_usage(UUID, TEXT, BIGINT) SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.increment_usage(UUID, TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
DROP POLICY "Users can manage their own projects" ON public.projects;
CREATE POLICY "Users can read their own projects" ON public.projects
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.projects FROM anon, authenticated;
REVOKE ALL ON public.event_receipts, public.ingest_rate_windows FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.account_usage_counters FROM anon, authenticated;
GRANT SELECT ON public.account_usage_counters TO authenticated;
GRANT ALL ON public.event_receipts, public.account_usage_counters, public.ingest_rate_windows TO service_role;

-- Preserve upstream plan allowances; LTD tiers are a separate billing change.
CREATE FUNCTION public.monthly_event_limit(p_plan TEXT) RETURNS BIGINT
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE p_plan WHEN 'growth' THEN NULL::BIGINT
    WHEN 'starter' THEN 1000000::BIGINT ELSE 100000::BIGINT END;
$$;
REVOKE ALL ON FUNCTION public.monthly_event_limit(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monthly_event_limit(TEXT) TO service_role;

CREATE FUNCTION public.ingest_event_batch(p_api_key TEXT, p_events JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_plan TEXT;
  v_limit BIGINT;
  v_used BIGINT;
  v_month TEXT;
  v_now TIMESTAMPTZ;
  v_window TIMESTAMPTZ;
  v_requests INTEGER;
  v_total INTEGER;
  v_new JSONB;
  v_count INTEGER;
BEGIN
  IF p_events IS NULL OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'events must be an array' USING ERRCODE = '22023';
  END IF;
  v_total := jsonb_array_length(p_events);
  IF v_total < 1 OR v_total > 100 OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_events) e
    WHERE jsonb_typeof(e) <> 'object' OR e->>'event_id' IS NULL
      OR length(e->>'event_id') NOT BETWEEN 1 AND 64
  ) THEN
    RAISE EXCEPTION 'a batch requires 1-100 events with stable IDs' USING ERRCODE = '22023';
  END IF;
  -- Read current key, and prevent key rotation/deletion until the write commits.
  SELECT * INTO v_project FROM public.projects WHERE api_key = p_api_key FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid_key'); END IF;
  INSERT INTO public.billing_accounts(user_id) VALUES (v_project.user_id)
    ON CONFLICT (user_id) DO NOTHING;
  -- One account lock serializes usage checks across all its products/workers.
  SELECT plan INTO v_plan FROM public.billing_accounts
    WHERE user_id = v_project.user_id FOR UPDATE;
  v_limit := public.monthly_event_limit(v_plan);
  v_now := clock_timestamp();
  v_month := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM');
  v_window := date_trunc('minute', v_now);
  INSERT INTO public.ingest_rate_windows AS w(user_id, window_start, requests)
    VALUES (v_project.user_id, v_window, 1)
    ON CONFLICT (user_id) DO UPDATE SET window_start = EXCLUDED.window_start,
      requests = CASE WHEN w.window_start = EXCLUDED.window_start
        THEN least(w.requests + 1, 121) ELSE 1 END
    RETURNING requests INTO v_requests;
  IF v_requests > 120 THEN
    RETURN jsonb_build_object('status', 'rate_limited', 'retry_after',
      greatest(1, ceil(extract(epoch FROM v_window + interval '1 minute' - v_now))));
  END IF;
  SELECT events INTO v_used FROM public.account_usage_counters
    WHERE user_id = v_project.user_id AND month = v_month;
  v_used := coalesce(v_used, 0);
  -- First occurrence wins within a batch. Receipts outlive raw-event pruning.
  SELECT coalesce(jsonb_agg(e.event ORDER BY e.ordinal), '[]'::jsonb) INTO v_new
  FROM (
    SELECT DISTINCT ON (event->>'event_id') event, ordinal
    FROM jsonb_array_elements(p_events) WITH ORDINALITY AS input(event, ordinal)
    ORDER BY event->>'event_id', ordinal
  ) e WHERE NOT EXISTS (
    SELECT 1 FROM public.event_receipts r WHERE r.project_id = v_project.id
      AND r.event_id = e.event->>'event_id'
  );
  v_count := jsonb_array_length(v_new);
  IF v_limit IS NOT NULL AND v_count > 0 AND v_used + v_count > v_limit THEN
    RETURN jsonb_build_object('status', 'quota_exceeded', 'accepted', 0,
      'duplicates', v_total - v_count, 'events_used', v_used, 'events_limit', v_limit,
      'month', v_month, 'retry_after', least(60, greatest(1, ceil(extract(epoch FROM
        ((date_trunc('month', v_now AT TIME ZONE 'UTC') + interval '1 month')
          AT TIME ZONE 'UTC') - v_now)))));
  END IF;
  IF v_count > 0 THEN
    INSERT INTO public.event_receipts(project_id, event_id, received_at)
      SELECT v_project.id, e->>'event_id', v_now FROM jsonb_array_elements(v_new) e;
    INSERT INTO public.llm_events(project_id, event_id, customer_id, feature, run_id,
      model, provider, input_tokens, output_tokens, cache_read_tokens,
      cache_write_tokens, cost_usd, metadata, occurred_at)
    SELECT v_project.id, e.event_id, e.customer_id, e.feature, e.run_id,
      e.model, e.provider, e.input_tokens, e.output_tokens, e.cache_read_tokens,
      e.cache_write_tokens, e.cost_usd, e.metadata, e.occurred_at
    FROM jsonb_to_recordset(v_new) AS e(event_id TEXT, customer_id TEXT, feature TEXT,
      run_id TEXT, model TEXT, provider TEXT, input_tokens INTEGER, output_tokens INTEGER,
      cache_read_tokens INTEGER, cache_write_tokens INTEGER, cost_usd NUMERIC,
      metadata JSONB, occurred_at TIMESTAMPTZ);
    INSERT INTO public.account_usage_counters AS c(user_id, month, events)
      VALUES (v_project.user_id, v_month, v_count)
      ON CONFLICT (user_id, month) DO UPDATE SET events = c.events + EXCLUDED.events;
    INSERT INTO public.usage_counters AS c(project_id, month, events)
      VALUES (v_project.id, v_month, v_count)
      ON CONFLICT (project_id, month) DO UPDATE SET events = c.events + EXCLUDED.events;
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'accepted', v_count,
    'duplicates', v_total - v_count, 'events_used', v_used + v_count,
    'events_limit', v_limit, 'month', v_month);
END;
$$;
REVOKE ALL ON FUNCTION public.ingest_event_batch(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_event_batch(TEXT, JSONB) TO service_role;

CREATE FUNCTION public.account_usage_status(p_user_id UUID) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('plan', coalesce(b.plan, 'free'),
    'events_limit', public.monthly_event_limit(coalesce(b.plan, 'free')),
    'events_used', coalesce(c.events, 0),
    'month', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'))
  FROM auth.users u LEFT JOIN public.billing_accounts b ON b.user_id = u.id
  LEFT JOIN public.account_usage_counters c ON c.user_id = u.id
    AND c.month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
  WHERE u.id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.account_usage_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage_status(UUID) TO service_role;
