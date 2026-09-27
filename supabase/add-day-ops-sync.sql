-- Pickup no-show, own-arrival, and job-order ticks — shared across devices.
-- Run once in SQL Editor after add-check-in.sql.

create table if not exists public.pickup_no_shows (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  adults int not null default 0 check (adults >= 0),
  children int not null default 0 check (children >= 0),
  infants int not null default 0 check (infants >= 0),
  tour_leaders int not null default 0 check (tour_leaders >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

create index if not exists pickup_no_shows_date_program_idx
  on public.pickup_no_shows (date, program);

drop trigger if exists pickup_no_shows_set_updated_at on public.pickup_no_shows;
create trigger pickup_no_shows_set_updated_at
before update on public.pickup_no_shows
for each row execute function public.set_updated_at();

create table if not exists public.own_arrivals (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  adults int not null default 0 check (adults >= 0),
  children int not null default 0 check (children >= 0),
  infants int not null default 0 check (infants >= 0),
  tour_leaders int not null default 0 check (tour_leaders >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

create index if not exists own_arrivals_date_program_idx
  on public.own_arrivals (date, program);

drop trigger if exists own_arrivals_set_updated_at on public.own_arrivals;
create trigger own_arrivals_set_updated_at
before update on public.own_arrivals
for each row execute function public.set_updated_at();

create table if not exists public.job_order_actions (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  action text not null check (action in ('stand-by', 'picked-up', 'no-show')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

create index if not exists job_order_actions_date_program_idx
  on public.job_order_actions (date, program);

drop trigger if exists job_order_actions_set_updated_at on public.job_order_actions;
create trigger job_order_actions_set_updated_at
before update on public.job_order_actions
for each row execute function public.set_updated_at();

alter table public.pickup_no_shows enable row level security;
alter table public.own_arrivals enable row level security;
alter table public.job_order_actions enable row level security;

drop policy if exists pilot_pickup_no_shows_all on public.pickup_no_shows;
create policy pilot_pickup_no_shows_all on public.pickup_no_shows
  for all to anon, authenticated using (true) with check (true);

drop policy if exists pilot_own_arrivals_all on public.own_arrivals;
create policy pilot_own_arrivals_all on public.own_arrivals
  for all to anon, authenticated using (true) with check (true);

drop policy if exists pilot_job_order_actions_all on public.job_order_actions;
create policy pilot_job_order_actions_all on public.job_order_actions
  for all to anon, authenticated using (true) with check (true);
