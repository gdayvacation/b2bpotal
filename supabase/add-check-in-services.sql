-- Marina check-in add-on services (longtail / scuba) per booking.
-- Run once in Supabase SQL Editor after add-check-in.sql.

create table if not exists public.check_in_services (
  id text primary key,
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  kind text not null check (kind in ('share-longtail', 'private-longtail', 'scuba')),
  people int not null default 1 check (people >= 1),
  price_per_person int not null default 0 check (price_per_person >= 0),
  paid boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists check_in_services_date_program_idx
  on public.check_in_services (date, program);

create index if not exists check_in_services_booking_idx
  on public.check_in_services (booking_code);

drop trigger if exists check_in_services_set_updated_at on public.check_in_services;
create trigger check_in_services_set_updated_at
before update on public.check_in_services
for each row execute function public.set_updated_at();

alter table public.check_in_services enable row level security;

drop policy if exists pilot_check_in_services_all on public.check_in_services;
create policy pilot_check_in_services_all on public.check_in_services
  for all to anon, authenticated using (true) with check (true);
