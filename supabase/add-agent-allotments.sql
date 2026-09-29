-- Agent prebuy allotments: seats (heads) purchased and total amount.
-- Safe to re-run.

create table if not exists public.agent_allotments (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  agent_name text not null,
  seats integer not null default 0
    check (seats >= 0),
  adult_seats integer not null default 0
    check (adult_seats >= 0),
  child_seats integer not null default 0
    check (child_seats >= 0),
  adult_price numeric not null default 0
    check (adult_price >= 0),
  child_price numeric not null default 0
    check (child_price >= 0),
  total_amount numeric not null default 0
    check (total_amount >= 0),
  paid_date date,
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_allotments_agent_slug_idx
  on public.agent_allotments (agent_slug);

create index if not exists agent_allotments_created_at_idx
  on public.agent_allotments (created_at desc);

drop trigger if exists agent_allotments_set_updated_at on public.agent_allotments;
create trigger agent_allotments_set_updated_at
before update on public.agent_allotments
for each row execute function public.set_updated_at();

alter table public.agent_allotments enable row level security;

drop policy if exists agent_allotments_staff_all on public.agent_allotments;
create policy agent_allotments_staff_all on public.agent_allotments
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

-- Pilot anon access matches other ops tables until staff JWT is required everywhere.
drop policy if exists agent_allotments_anon_all on public.agent_allotments;
create policy agent_allotments_anon_all on public.agent_allotments
  for all to anon
  using (true)
  with check (true);

grant select, insert, update, delete on table public.agent_allotments to anon, authenticated;
