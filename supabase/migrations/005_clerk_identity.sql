-- Keep internal UUID ownership while moving login to Clerk.
CREATE TABLE public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT UNIQUE CHECK (clerk_user_id ~ '^user_[A-Za-z0-9]+$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_users FROM anon, authenticated;
GRANT ALL ON public.app_users TO service_role;

-- Preserve any legacy identity and its records, without linking accounts by email.
INSERT INTO public.app_users(id) SELECT id FROM auth.users;
ALTER TABLE public.projects DROP CONSTRAINT projects_user_id_fkey;
ALTER TABLE public.projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);
ALTER TABLE public.billing_accounts DROP CONSTRAINT billing_accounts_user_id_fkey;
ALTER TABLE public.billing_accounts ADD CONSTRAINT billing_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);
ALTER TABLE public.account_usage_counters DROP CONSTRAINT account_usage_counters_user_id_fkey;
ALTER TABLE public.account_usage_counters ADD CONSTRAINT account_usage_counters_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);
ALTER TABLE public.ingest_rate_windows DROP CONSTRAINT ingest_rate_windows_user_id_fkey;
ALTER TABLE public.ingest_rate_windows ADD CONSTRAINT ingest_rate_windows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);

-- All browser data access now passes through the Clerk-authenticated backend.
-- Retain RLS as defense in depth and preserve service-role ingestion and jobs.
REVOKE ALL ON public.projects, public.llm_events, public.stripe_customers,
  public.alert_configs, public.daily_rollups, public.billing_accounts,
  public.usage_counters, public.account_usage_counters, public.event_receipts,
  public.ingest_rate_windows FROM anon, authenticated;

CREATE FUNCTION public.resolve_clerk_user(p_clerk_user_id TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_user public.app_users%ROWTYPE;
BEGIN
  IF p_clerk_user_id IS NULL OR p_clerk_user_id !~ '^user_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'Invalid Clerk subject' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.app_users(clerk_user_id) VALUES (p_clerk_user_id)
    ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
    RETURNING * INTO v_user;
  RETURN jsonb_build_object('id', v_user.id, 'clerk_user_id', v_user.clerk_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_clerk_user(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_clerk_user(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.account_usage_status(p_user_id UUID) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT jsonb_build_object('plan', coalesce(b.plan, 'free'),
    'events_limit', public.monthly_event_limit(coalesce(b.plan, 'free')),
    'events_used', coalesce(c.events, 0),
    'month', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'))
  FROM public.app_users u LEFT JOIN public.billing_accounts b ON b.user_id = u.id
  LEFT JOIN public.account_usage_counters c ON c.user_id = u.id
    AND c.month = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM')
  WHERE u.id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.account_usage_status(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage_status(UUID) TO service_role;
