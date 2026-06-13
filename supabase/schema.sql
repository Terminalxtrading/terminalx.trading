create extension if not exists pgcrypto;

create table if not exists public.market_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  session text not null check (session in ('morning', 'midday', 'intraday', 'closing')),
  market_mood text not null check (market_mood in ('Bullish', 'Bearish', 'Sideways')),
  market_mood_details jsonb not null default '{}'::jsonb,
  sector_in_focus text not null,
  stocks_in_focus jsonb not null default '[]'::jsonb,
  extreme_movement_alerts jsonb not null default '[]'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  catalysts jsonb not null default '{}'::jsonb,
  options_research jsonb not null default '[]'::jsonb,
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sector_scores (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.market_reports(id) on delete cascade,
  report_date date not null,
  session text not null check (session in ('morning', 'midday', 'intraday', 'closing')),
  rank integer not null,
  sector text not null,
  symbol text not null,
  sector_score numeric(6, 2) not null,
  relative_strength_score numeric(6, 2) not null,
  momentum_score numeric(6, 2) not null,
  trend_score numeric(6, 2) not null,
  one_day_change_percent numeric(8, 2) not null,
  five_day_change_percent numeric(8, 2) not null,
  twenty_day_change_percent numeric(8, 2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_scores (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.market_reports(id) on delete cascade,
  report_date date not null,
  session text not null check (session in ('morning', 'midday', 'intraday', 'closing')),
  rank integer not null,
  symbol text not null,
  name text not null,
  sector text not null,
  total_score numeric(6, 2) not null,
  relative_strength_score numeric(6, 2) not null,
  volume_spike_score numeric(6, 2) not null,
  breakout_score numeric(6, 2) not null,
  trend_strength_score numeric(6, 2) not null,
  news_impact_score numeric(6, 2) not null,
  one_day_change_percent numeric(8, 2) not null,
  five_day_change_percent numeric(8, 2) not null,
  twenty_day_change_percent numeric(8, 2) not null,
  volume_ratio numeric(8, 2) not null,
  breakout_percent numeric(8, 2) not null,
  attention_score numeric(6, 2) not null default 0,
  setup_quality_score numeric(6, 2) not null default 0,
  setup_direction text not null default 'neutral-watch',
  reference_price numeric(12, 2) not null default 0,
  support_zone_low numeric(12, 2) not null default 0,
  support_zone_high numeric(12, 2) not null default 0,
  resistance_zone_low numeric(12, 2) not null default 0,
  resistance_zone_high numeric(12, 2) not null default 0,
  historical_edge_score numeric(6, 2) not null default 0,
  confidence_score numeric(6, 2) not null default 0,
  risk_score numeric(6, 2) not null default 50,
  why_in_focus text not null default 'Research-only focus context unavailable.',
  risk_note text not null default 'Research-only risk context.',
  market_context text not null default 'Research-only market context unavailable.',
  catalyst_summary text not null default 'Catalyst tone unavailable.',
  research_note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_history (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.market_reports(id) on delete set null,
  alert_key text not null unique,
  priority text not null check (priority in ('Critical', 'High', 'Medium', 'Low')),
  title text not null,
  reason text not null,
  sector text not null,
  stocks_affected text[] not null default '{}',
  alert_type text not null,
  trigger_value numeric(10, 2) not null,
  threshold_value numeric(10, 2) not null,
  notification_status text not null default 'created' check (notification_status in ('created', 'sent', 'failed', 'duplicate', 'skipped')),
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  triggered_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.watchlist_stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text not null,
  is_tracked boolean not null default true,
  trend_score numeric(6, 2) not null default 0,
  momentum_score numeric(6, 2) not null default 0,
  relative_strength_score numeric(6, 2) not null default 0,
  volume_score numeric(6, 2) not null default 0,
  health_score numeric(6, 2) not null default 0,
  one_day_change_percent numeric(8, 2) not null default 0,
  five_day_change_percent numeric(8, 2) not null default 0,
  twenty_day_change_percent numeric(8, 2) not null default 0,
  volume_ratio numeric(8, 2) not null default 0,
  latest_close numeric(12, 2) not null default 0,
  research_note text not null default 'Research-only watchlist tracking.',
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.realtime_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  snapshot_at timestamptz not null,
  market_bias text not null,
  market_breadth jsonb not null default '{}'::jsonb,
  sector_rotation jsonb not null default '[]'::jsonb,
  attention_scores jsonb not null default '[]'::jsonb,
  options_research jsonb not null default '[]'::jsonb,
  option_strike_potential jsonb not null default '[]'::jsonb,
  oi_buildup jsonb not null default '[]'::jsonb,
  watchlist jsonb not null default '[]'::jsonb,
  health jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.realtime_worker_health (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null unique,
  status text not null check (status in ('starting', 'sleeping', 'running', 'healthy', 'degraded', 'failed', 'stopped')),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists sector_scores_report_idx on public.sector_scores(report_id, rank);
create index if not exists stock_scores_report_idx on public.stock_scores(report_id, rank);
create index if not exists stock_scores_symbol_idx on public.stock_scores(symbol, report_date desc);
create index if not exists stock_scores_trade_intelligence_idx on public.stock_scores(confidence_score desc, risk_score asc, attention_score desc);
create index if not exists notification_history_priority_idx on public.notification_history(priority, triggered_at desc);
create index if not exists notification_history_report_idx on public.notification_history(report_id);
create index if not exists watchlist_stocks_health_idx on public.watchlist_stocks(health_score desc);
create index if not exists watchlist_stocks_tracked_idx on public.watchlist_stocks(is_tracked, updated_at desc);
create index if not exists realtime_market_snapshots_created_idx on public.realtime_market_snapshots(created_at desc);
create index if not exists realtime_market_snapshots_bias_idx on public.realtime_market_snapshots(market_bias, snapshot_at desc);

alter table public.market_reports enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.sector_scores enable row level security;
alter table public.stock_scores enable row level security;
alter table public.notification_history enable row level security;
alter table public.watchlist_stocks enable row level security;
alter table public.realtime_market_snapshots enable row level security;
alter table public.realtime_worker_health enable row level security;

create policy "Reports are readable by anon users"
  on public.market_reports for select
  to anon
  using (true);

create policy "Service role manages reports"
  on public.market_reports for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manages push subscriptions"
  on public.push_subscriptions for all
  to service_role
  using (true)
  with check (true);

create policy "Sector scores are readable by anon users"
  on public.sector_scores for select
  to anon
  using (true);

create policy "Stock scores are readable by anon users"
  on public.stock_scores for select
  to anon
  using (true);

create policy "Service role manages sector scores"
  on public.sector_scores for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manages stock scores"
  on public.stock_scores for all
  to service_role
  using (true)
  with check (true);

create policy "Service role manages notification history"
  on public.notification_history for all
  to service_role
  using (true)
  with check (true);

create policy "Watchlist stocks are readable by anon users"
  on public.watchlist_stocks for select
  to anon
  using (true);

create policy "Service role manages watchlist stocks"
  on public.watchlist_stocks for all
  to service_role
  using (true)
  with check (true);

create policy "Realtime snapshots are readable by anon users"
  on public.realtime_market_snapshots for select
  to anon
  using (true);

create policy "Service role manages realtime snapshots"
  on public.realtime_market_snapshots for all
  to service_role
  using (true)
  with check (true);

create policy "Realtime worker health is readable by anon users"
  on public.realtime_worker_health for select
  to anon
  using (true);

create policy "Service role manages realtime worker health"
  on public.realtime_worker_health for all
  to service_role
  using (true)
  with check (true);

do $$
begin
  alter publication supabase_realtime add table public.watchlist_stocks;
exception
  when duplicate_object then null;
end $$;
