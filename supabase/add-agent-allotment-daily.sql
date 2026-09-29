-- Daily allotment checker: staff-editable total heads deducted per agent per day.
-- Booking / check-in / no-show / invoice heads are computed live in the app.
-- Safe to re-run.

create table if not exists public.agent_allotment_daily (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  agent_slug text not null,
  agent_name text not null,
  total_deduct integer not null default 0
    check (total_deduct >= 0),
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (day, agent_slug)
);

create index if not exists agent_allotment_daily_day_idx
  on public.agent_allotment_daily (day desc);

create index if not exists agent_allotment_daily_agent_slug_idx
  on public.agent_allotment_daily (agent_slug);

drop trigger if exists agent_allotment_daily_set_updated_at on public.agent_allotment_daily;
create trigger agent_allotment_daily_set_updated_at
before update on public.agent_allotment_daily
for each row execute function public.set_updated_at();

alter table public.agent_allotment_daily enable row level security;

drop policy if exists agent_allotment_daily_staff_all on public.agent_allotment_daily;
create policy agent_allotment_daily_staff_all on public.agent_allotment_daily
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

drop policy if exists agent_allotment_daily_anon_all on public.agent_allotment_daily;
create policy agent_allotment_daily_anon_all on public.agent_allotment_daily
  for all to anon
  using (true)
  with check (true);

grant select, insert, update, delete on table public.agent_allotment_daily to anon, authenticated;
