begin;
create table public.organizations (
 id uuid primary key default gen_random_uuid(), owner_id uuid unique not null references auth.users(id) on delete cascade,
 name text not null default 'My workspace', tier integer not null default 3 check(tier between 1 and 3),
 target_margin numeric not null default 60 check(target_margin between 0 and 100), email_alerts boolean not null default false,
 slack_webhook text, stripe_account_id text unique, stripe_sync_warnings jsonb not null default '[]', created_at timestamptz not null default now()
);
create table public.products(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,name text not null,created_at timestamptz default now(),unique(id,organization_id));
create table public.api_keys(id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations on delete cascade,product_id uuid not null,key_hash text not null unique,prefix text not null,created_at timestamptz default now(),revoked_at timestamptz,foreign key(product_id,organization_id) references public.products(id,organization_id) on delete cascade);
create table public.subscriptions(id text not null,organization_id uuid not null references public.organizations on delete cascade,customer_id text not null,customer_name text not null,customer_email text not null default '',plan text not null,revenue numeric(18,6) not null check(revenue>=0),currency text not null check(currency='usd'),period_start timestamptz not null,period_end timestamptz not null,status text not null,product_id uuid,primary key(organization_id,id),foreign key(product_id,organization_id) references public.products(id,organization_id),check(period_end>period_start));
create table public.usage_events(id uuid not null,organization_id uuid not null references public.organizations on delete cascade,product_id uuid not null,customer_id text not null,user_id text,feature text not null,provider text not null,model text not null,input_tokens bigint not null,output_tokens bigint not null,cached_input_tokens bigint not null default 0,cache_write_tokens bigint not null default 0,cache_write_1h_tokens bigint not null default 0,cost numeric(20,9) not null check(cost>=0),pricing_version text not null,occurred_at timestamptz not null,received_at timestamptz not null default now(),primary key(product_id,id),foreign key(product_id,organization_id) references public.products(id,organization_id));
create index usage_events_period_idx on public.usage_events(organization_id,customer_id,occurred_at);
create table public.daily_usage(organization_id uuid not null references public.organizations on delete cascade,product_id uuid not null,customer_id text not null,day date not null,feature text not null,model text not null,cost numeric(20,9) not null default 0,runs bigint not null default 0,primary key(product_id,customer_id,day,feature,model),foreign key(product_id,organization_id) references public.products(id,organization_id));
create index daily_usage_period_idx on public.daily_usage(organization_id,day);
create table public.monthly_meter(organization_id uuid not null references public.organizations on delete cascade,month date not null,events bigint not null default 0,primary key(organization_id,month));
create table public.event_receipts(product_id uuid not null references public.products on delete cascade,event_id uuid not null,received_at timestamptz not null default now(),primary key(product_id,event_id));
alter table public.event_receipts enable row level security;
revoke all on public.event_receipts from anon,authenticated;
create table public.alert_deliveries(organization_id uuid not null references public.organizations on delete cascade,day date not null,channel text not null,payload_hash text not null,claimed_at timestamptz not null default now(),sent_at timestamptz,primary key(organization_id,day,channel,payload_hash));
create function public.bootstrap_workspace() returns trigger language plpgsql security definer set search_path=public as $$
declare org uuid;
begin insert into public.organizations(owner_id) values(new.id) returning id into org;insert into public.products(organization_id,name) values(org,'My first app');return new;end;$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.bootstrap_workspace();
-- Organization ownership is the sole membership model in this private beta.
create function public.owns_org(org uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.organizations where id=org and owner_id=(select auth.uid()));$$;
alter table public.organizations enable row level security;
create policy owner_read on public.organizations for select to authenticated using(owner_id=(select auth.uid()));
do $$declare t text;begin foreach t in array array['products','api_keys','subscriptions','usage_events','daily_usage','monthly_meter','alert_deliveries'] loop execute format('alter table public.%I enable row level security',t);execute format('create policy owner_read on public.%I for select to authenticated using (public.owns_org(organization_id))',t);end loop;end;$$;
-- Application mutations go through authenticated server handlers. No browser write policies.
revoke all on public.organizations,public.products,public.api_keys,public.subscriptions,public.usage_events,public.daily_usage,public.monthly_meter,public.alert_deliveries from anon,authenticated;
grant select on public.organizations,public.products,public.subscriptions,public.daily_usage,public.monthly_meter to authenticated;
create function public.create_product(p_org uuid,p_name text) returns jsonb language plpgsql security definer set search_path=public as $$
declare n integer; lim integer; result public.products;
begin select case tier when 1 then 1 when 2 then 3 else 5 end into lim from public.organizations where id=p_org for update;if not found then raise exception 'Organization not found';end if;select count(*) into n from public.products where organization_id=p_org;if n>=lim then raise exception 'Product limit reached';end if;insert into public.products(organization_id,name) values(p_org,p_name) returning * into result;return to_jsonb(result);end;$$;
create function public.ingest_events(p_key uuid,p_events jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare k public.api_keys; lim integer; used bigint; incoming integer; added integer; month_start date:=date_trunc('month',now() at time zone 'utc')::date;
begin
 select * into k from public.api_keys where id=p_key and revoked_at is null for share;if not found then raise exception 'Invalid key';end if;
 select tier*10000 into lim from public.organizations where id=k.organization_id for update;
 insert into public.monthly_meter(organization_id,month) values(k.organization_id,month_start) on conflict do nothing;
 select events into used from public.monthly_meter where organization_id=k.organization_id and month=month_start for update;
 select count(distinct x->>'id') into incoming from jsonb_array_elements(p_events) x where not exists(select 1 from public.event_receipts u where u.product_id=k.product_id and u.event_id=(x->>'id')::uuid);
 if used+incoming>lim then raise exception 'Monthly event limit exceeded';end if;
 with receipts as (
 insert into public.event_receipts(product_id,event_id) select distinct k.product_id,(x->>'id')::uuid from jsonb_array_elements(p_events) x on conflict do nothing returning event_id
 ), inserted as (
 insert into public.usage_events(id,organization_id,product_id,customer_id,user_id,feature,provider,model,input_tokens,output_tokens,cached_input_tokens,cache_write_tokens,cache_write_1h_tokens,cost,pricing_version,occurred_at)
 select (x->>'id')::uuid,k.organization_id,k.product_id,x->>'customerId',x->>'userId',x->>'feature',x->>'provider',x->>'model',(x->>'inputTokens')::bigint,(x->>'outputTokens')::bigint,(x->>'cachedInputTokens')::bigint,(x->>'cacheWriteTokens')::bigint,(x->>'cacheWrite1hTokens')::bigint,(x->>'cost')::numeric,x->>'pricingVersion',(x->>'timestamp')::timestamptz from jsonb_array_elements(p_events) x join receipts r on r.event_id=(x->>'id')::uuid on conflict do nothing returning *
 ), rollups as (
 insert into public.daily_usage(organization_id,product_id,customer_id,day,feature,model,cost,runs)
 select organization_id,product_id,customer_id,(occurred_at at time zone 'utc')::date,feature,model,sum(cost),count(*) from inserted group by 1,2,3,4,5,6
 on conflict(product_id,customer_id,day,feature,model) do update set cost=daily_usage.cost+excluded.cost,runs=daily_usage.runs+excluded.runs returning 1
 ) select count(*) into added from inserted;
 update public.monthly_meter set events=events+added where organization_id=k.organization_id and month=month_start;
 return added;
end;$$;
-- Keep aggregate history while deleting raw events according to tier.
create function public.prune_raw_events() returns void language sql security definer set search_path=public as $$delete from public.usage_events e using public.organizations o where e.organization_id=o.id and e.received_at < now()-make_interval(days=>o.tier*30) and not exists(select 1 from public.subscriptions s where s.organization_id=e.organization_id and s.customer_id=e.customer_id and s.status='active' and s.period_end>now() and (e.occurred_at at time zone 'utc')::date >= (s.period_start at time zone 'utc')::date); delete from public.event_receipts where received_at<now()-interval '100 days';$$;
revoke all on function public.ingest_events(uuid,jsonb),public.create_product(uuid,text),public.prune_raw_events(),public.bootstrap_workspace() from public,anon,authenticated;
grant execute on function public.ingest_events(uuid,jsonb),public.create_product(uuid,text),public.prune_raw_events() to service_role;
create function public.claim_alert_delivery(p_org uuid,p_day date,p_channel text,p_hash text) returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;begin insert into public.alert_deliveries(organization_id,day,channel,payload_hash) values(p_org,p_day,p_channel,p_hash) on conflict(organization_id,day,channel,payload_hash) do update set claimed_at=now() where alert_deliveries.sent_at is null and alert_deliveries.claimed_at<now()-interval '15 minutes';get diagnostics n=row_count;return n>0;end;$$;
create table public.lifetime_purchases(session_id text primary key,organization_id uuid not null references public.organizations on delete cascade,tier integer not null,created_at timestamptz default now());
alter table public.lifetime_purchases enable row level security;
revoke all on public.lifetime_purchases from anon,authenticated;
create function public.grant_lifetime_tier(p_org uuid,p_tier integer,p_session text) returns void language plpgsql security definer set search_path=public as $$
begin if p_tier not between 1 and 3 then raise exception 'Invalid tier';end if;insert into public.lifetime_purchases values(p_session,p_org,p_tier,now()) on conflict do nothing;if found then update public.organizations set tier=greatest(tier,p_tier) where id=p_org;end if;end;$$;
revoke all on function public.claim_alert_delivery(uuid,date,text,text),public.grant_lifetime_tier(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.claim_alert_delivery(uuid,date,text,text),public.grant_lifetime_tier(uuid,integer,text) to service_role;
-- Daily rollups are corrected at exact Stripe boundaries using retained raw events.
create function public.billing_boundary_adjustments(p_org uuid,p_product uuid default null)
returns table(customer_id text,day date,feature text,model text,cost numeric,runs bigint,product_id uuid)
language sql stable security definer set search_path=public as $$
 select e.customer_id,(e.occurred_at at time zone 'utc')::date,e.feature,e.model,-sum(e.cost),-count(*),e.product_id
 from public.usage_events e
 where (public.owns_org(p_org) or current_setting('role',true)='service_role') and e.organization_id=p_org and (p_product is null or e.product_id=p_product)
 and exists(select 1 from public.subscriptions s where s.organization_id=p_org and s.customer_id=e.customer_id and s.status='active' and s.period_end>now() and (p_product is null or s.product_id=p_product)
 and (((e.occurred_at at time zone 'utc')::date=(s.period_start at time zone 'utc')::date and e.occurred_at<s.period_start) or ((e.occurred_at at time zone 'utc')::date=(s.period_end at time zone 'utc')::date and e.occurred_at>=s.period_end)))
 group by 1,2,3,4,7;
$$;
revoke all on function public.billing_boundary_adjustments(uuid,uuid) from public,anon;
grant execute on function public.billing_boundary_adjustments(uuid,uuid) to authenticated,service_role;
commit;
