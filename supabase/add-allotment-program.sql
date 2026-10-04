-- Separate Phi Phi and James Bond allotments.
-- Existing lots and daily rows stay on Phi Phi.
-- Safe to re-run.

alter table public.agent_allotments
  add column if not exists program text not null default 'PP';

alter table public.agent_allotments
  drop constraint if exists agent_allotments_program_check;

alter table public.agent_allotments
  add constraint agent_allotments_program_check
  check (program in ('PP', 'James Bond'));

alter table public.agent_allotment_daily
  add column if not exists program text not null default 'PP';

alter table public.agent_allotment_daily
  drop constraint if exists agent_allotment_daily_program_check;

alter table public.agent_allotment_daily
  add constraint agent_allotment_daily_program_check
  check (program in ('PP', 'James Bond'));

alter table public.agent_allotment_daily
  drop constraint if exists agent_allotment_daily_day_agent_slug_key;

alter table public.agent_allotment_daily
  drop constraint if exists agent_allotment_daily_day_agent_slug_program_key;

alter table public.agent_allotment_daily
  add constraint agent_allotment_daily_day_agent_slug_program_key
  unique (day, agent_slug, program);
