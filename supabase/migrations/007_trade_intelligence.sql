alter table public.stock_scores
  add column if not exists confidence_score numeric(6, 2) not null default 0,
  add column if not exists risk_score numeric(6, 2) not null default 50,
  add column if not exists why_in_focus text not null default 'Research-only focus context unavailable.',
  add column if not exists market_context text not null default 'Research-only market context unavailable.';

create index if not exists stock_scores_trade_intelligence_idx
  on public.stock_scores(confidence_score desc, risk_score asc, attention_score desc);
