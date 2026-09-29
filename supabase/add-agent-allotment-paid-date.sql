-- Paid date for agent prebuy allotments. Safe to re-run.

alter table public.agent_allotments
  add column if not exists paid_date date;
