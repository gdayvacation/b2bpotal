-- Park fee included/excluded flag on agent allotment purchases.
-- Safe to re-run.

alter table public.agent_allotments
  add column if not exists park_fee text not null default 'exc'
    check (park_fee in ('inc', 'exc'));
