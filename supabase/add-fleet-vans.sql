-- Van phone on day plans + remembered fleet vans (reuse across days).
-- Run once in Supabase SQL Editor.

alter table public.van_meta
  add column if not exists phone text not null default '';

create table if not exists public.fleet_vans (
  van_number int primary key check (van_number >= 1),
  plate text not null default '',
  driver text not null default '',
  phone text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists fleet_vans_set_updated_at on public.fleet_vans;
create trigger fleet_vans_set_updated_at
before update on public.fleet_vans
for each row execute function public.set_updated_at();

alter table public.fleet_vans enable row level security;

drop policy if exists pilot_fleet_vans_all on public.fleet_vans;
create policy pilot_fleet_vans_all on public.fleet_vans
  for all using (true) with check (true);
