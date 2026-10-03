-- A saved Daily checker day can belong to one allotment.
-- One lot per agent receives the next save. Opening a new lot switches that target.
-- Safe to re-run.

alter table public.agent_allotments
  add column if not exists receives_bookings boolean not null default false;

alter table public.agent_allotment_daily
  add column if not exists allotment_id uuid references public.agent_allotments(id) on delete set null;

create index if not exists agent_allotment_daily_allotment_id_idx
  on public.agent_allotment_daily (allotment_id);

with ranked as (
  select
    id,
    row_number() over (
      partition by agent_slug
      order by paid_date desc nulls last, created_at desc
    ) as n
  from public.agent_allotments
)
update public.agent_allotments as allotment
set receives_bookings = ranked.n = 1
from ranked
where allotment.id = ranked.id;
