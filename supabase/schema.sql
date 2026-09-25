-- =============================================================================
-- G'day B2B Portal — Supabase schema (run once in SQL Editor)
-- Maps to: agents, pickup zones, bookings, availability, boat & van plans
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Agents (partner travel companies)
-- -----------------------------------------------------------------------------
create table if not exists public.agents (
  slug text primary key,
  name text not null,
  country text not null default '',
  status text not null default 'Active'
    check (status in ('Active', 'Inactive')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists agents_set_updated_at on public.agents;
create trigger agents_set_updated_at
before update on public.agents
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Pickup zones (Patong / Kata / Karon / Other / custom)
-- -----------------------------------------------------------------------------
create table if not exists public.pickup_zones (
  name text primary key,
  time text not null default 'Awaiting pickup time',
  pending boolean not null default false,
  sort_order int not null default 100,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists pickup_zones_set_updated_at on public.pickup_zones;
create trigger pickup_zones_set_updated_at
before update on public.pickup_zones
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Hotels (agent typeahead; zone nullable until admin assigns)
-- -----------------------------------------------------------------------------
create table if not exists public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone_name text null references public.pickup_zones (name)
    on update cascade on delete set null,
  active boolean not null default true,
  extra_charge_transfer text not null default '',
  sort_order int not null default 100,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint hotels_name_nonempty check (length(trim(name)) > 0)
);

create unique index if not exists hotels_name_lower_uidx
  on public.hotels (lower(trim(name)));

create index if not exists hotels_zone_name_idx
  on public.hotels (zone_name);

create index if not exists hotels_active_name_idx
  on public.hotels (active, name);

drop trigger if exists hotels_set_updated_at on public.hotels;
create trigger hotels_set_updated_at
before update on public.hotels
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Bookings
-- -----------------------------------------------------------------------------
create table if not exists public.bookings (
  code text primary key,
  agent_slug text not null references public.agents (slug) on update cascade on delete restrict,
  agent_name text not null,
  agent_ref text not null default '',
  program text not null check (program in ('PP', 'James Bond')),
  date date not null,
  park_fee text not null default 'Included'
    check (park_fee in ('Included', 'Not Included')),
  canoe text null
    check (canoe is null or canoe in ('Included', 'Not Included')),
  adults int not null default 0 check (adults >= 0),
  children int not null default 0 check (children >= 0),
  infants int not null default 0 check (infants >= 0),
  tour_leaders int not null default 0 check (tour_leaders >= 0),
  lead_guest text not null,
  pickup_zone text not null,
  pickup_hotel text not null default '',
  room_number text not null default '',
  note text not null default '',
  cash_on_tour text not null default '',
  transfer_extra_charge text not null default '',
  private_transfer_vehicle text not null default ''
    check (private_transfer_vehicle in ('', 'Car', 'Van')),
  private_transfer_price text not null default '',
  private_driver_name text not null default '',
  private_driver_phone text not null default '',
  pickup_time text not null default 'Awaiting pickup time',
  status text not null default 'Pending Pickup Time'
    check (status in ('Confirmed', 'Pending Pickup Time', 'Cancelled')),
  late_change_fee int not null default 0 check (late_change_fee >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint bookings_pax_positive
    check (adults + children + infants + tour_leaders >= 1)
);

create index if not exists bookings_date_program_idx
  on public.bookings (date, program);

create index if not exists bookings_agent_slug_idx
  on public.bookings (agent_slug);

create index if not exists bookings_date_idx
  on public.bookings (date);

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Daily capacity overrides (default in app: PP=60, JB=20 when row missing)
-- -----------------------------------------------------------------------------
create table if not exists public.availability (
  date date primary key,
  pp_capacity int not null default 44 check (pp_capacity >= 0),
  james_bond_capacity int not null default 40 check (james_bond_capacity >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists availability_set_updated_at on public.availability;
create trigger availability_set_updated_at
before update on public.availability
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Boat plans (flexible boat count per date + program; default 3 × 50)
-- -----------------------------------------------------------------------------
create table if not exists public.day_boat_plans (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  capacity_1 int not null default 50 check (capacity_1 >= 1),
  capacity_2 int not null default 50 check (capacity_2 >= 1),
  capacity_3 int not null default 50 check (capacity_3 >= 1),
  /** Source of truth for boat count + per-boat seats (e.g. [50,50,60]). */
  capacities jsonb not null default '[50, 50, 50]'::jsonb,
  boat_names jsonb not null default '["","",""]'::jsonb,
  boat_guides jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program)
);

drop trigger if exists day_boat_plans_set_updated_at on public.day_boat_plans;
create trigger day_boat_plans_set_updated_at
before update on public.day_boat_plans
for each row execute function public.set_updated_at();

create table if not exists public.boat_assignments (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null references public.bookings (code) on delete cascade,
  boat_number int not null check (boat_number >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code),
  foreign key (date, program)
    references public.day_boat_plans (date, program)
    on delete cascade
);

create index if not exists boat_assignments_booking_idx
  on public.boat_assignments (booking_code);

drop trigger if exists boat_assignments_set_updated_at on public.boat_assignments;
create trigger boat_assignments_set_updated_at
before update on public.boat_assignments
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Van / transfer plans
-- -----------------------------------------------------------------------------
create table if not exists public.day_vehicle_plans (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  van_capacity int not null default 12 check (van_capacity >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program)
);

drop trigger if exists day_vehicle_plans_set_updated_at on public.day_vehicle_plans;
create trigger day_vehicle_plans_set_updated_at
before update on public.day_vehicle_plans
for each row execute function public.set_updated_at();

create table if not exists public.van_meta (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  van_number int not null check (van_number >= 1),
  plate text not null default '',
  driver text not null default '',
  phone text not null default '',
  capacity int check (capacity is null or (capacity >= 1 and capacity <= 40)),
  outsourced boolean not null default false,
  outsource_company text not null default '',
  special_kind text not null default '',
  transfer_in boolean not null default false,
  transfer_out boolean not null default false,
  charge_amount numeric not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, van_number),
  foreign key (date, program)
    references public.day_vehicle_plans (date, program)
    on delete cascade
);

drop trigger if exists van_meta_set_updated_at on public.van_meta;
create trigger van_meta_set_updated_at
before update on public.van_meta
for each row execute function public.set_updated_at();

-- Remembered van roster (same vans reused across days)
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

-- Remembered drivers (name → phone + plate)
create table if not exists public.drivers (
  name text primary key,
  phone text not null default '',
  plate text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists drivers_set_updated_at on public.drivers;
create trigger drivers_set_updated_at
before update on public.drivers
for each row execute function public.set_updated_at();

-- One booking can split across multiple vans (pax legs)
create table if not exists public.van_assignments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null references public.bookings (code) on delete cascade,
  van_number int not null check (van_number >= 1),
  pax int not null check (pax >= 1),
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (date, program, booking_code, van_number),
  foreign key (date, program)
    references public.day_vehicle_plans (date, program)
    on delete cascade
);

create index if not exists van_assignments_booking_idx
  on public.van_assignments (booking_code);

create index if not exists van_assignments_day_idx
  on public.van_assignments (date, program, van_number);

create index if not exists van_assignments_van_order_idx
  on public.van_assignments (date, program, van_number, sort_order);

drop trigger if exists van_assignments_set_updated_at on public.van_assignments;
create trigger van_assignments_set_updated_at
before update on public.van_assignments
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Booking cutoffs (singleton: when agents may book / cancel vs travel date)
-- -----------------------------------------------------------------------------
create table if not exists public.booking_cutoffs (
  id text primary key default 'default' check (id = 'default'),
  timezone text not null default 'Asia/Bangkok',
  book_before_days int not null default 1
    check (book_before_days >= 0 and book_before_days <= 30),
  book_until_time text not null default '18:00'
    check (book_until_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  cancel_before_days int not null default 1
    check (cancel_before_days >= 0 and cancel_before_days <= 30),
  cancel_until_time text not null default '23:59'
    check (cancel_until_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  late_fee_from_time text not null default '20:00'
    check (late_fee_from_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  date_change_fee_thb int not null default 300
    check (date_change_fee_thb >= 0 and date_change_fee_thb <= 20000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists booking_cutoffs_set_updated_at on public.booking_cutoffs;
create trigger booking_cutoffs_set_updated_at
before update on public.booking_cutoffs
for each row execute function public.set_updated_at();

insert into public.booking_cutoffs (id)
values ('default')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Booking closures (admin closes a date + program: storm, boat out, etc.)
-- -----------------------------------------------------------------------------
create table if not exists public.booking_closures (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  reason text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program)
);

drop trigger if exists booking_closures_set_updated_at on public.booking_closures;
create trigger booking_closures_set_updated_at
before update on public.booking_closures
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Booking change history
-- -----------------------------------------------------------------------------
create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null references public.bookings (code) on update cascade on delete cascade,
  event_type text not null
    check (event_type in (
      'created',
      'cancelled',
      'date_changed',
      'rebooked',
      'pickup_set',
      'details_edited'
    )),
  summary text not null default '',
  actor_role text not null check (actor_role in ('admin', 'agent')),
  actor_name text not null default '',
  actor_slug text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_events_booking_code_idx
  on public.booking_events (booking_code, created_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- Pilot: open anon/authenticated (tighten when you add real Auth)
-- Server should still prefer service_role for admin writes.
-- -----------------------------------------------------------------------------
alter table public.agents enable row level security;
alter table public.pickup_zones enable row level security;
alter table public.hotels enable row level security;
alter table public.bookings enable row level security;
alter table public.availability enable row level security;
alter table public.day_boat_plans enable row level security;
alter table public.boat_assignments enable row level security;
alter table public.day_vehicle_plans enable row level security;
alter table public.van_meta enable row level security;
alter table public.van_assignments enable row level security;
alter table public.fleet_vans enable row level security;
alter table public.drivers enable row level security;
alter table public.booking_cutoffs enable row level security;
alter table public.booking_closures enable row level security;
alter table public.booking_events enable row level security;

-- Drop old pilot policies if re-running
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'agents', 'pickup_zones', 'hotels', 'bookings', 'availability',
        'day_boat_plans', 'boat_assignments',
        'day_vehicle_plans', 'van_meta', 'van_assignments', 'fleet_vans', 'drivers',
        'booking_cutoffs', 'booking_closures', 'booking_events'
      )
      and policyname like 'pilot_%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy pilot_agents_all on public.agents
  for all to anon, authenticated using (true) with check (true);

create policy pilot_pickup_zones_all on public.pickup_zones
  for all to anon, authenticated using (true) with check (true);

create policy pilot_hotels_all on public.hotels
  for all to anon, authenticated using (true) with check (true);

create policy pilot_bookings_all on public.bookings
  for all to anon, authenticated using (true) with check (true);

create policy pilot_availability_all on public.availability
  for all to anon, authenticated using (true) with check (true);

create policy pilot_day_boat_plans_all on public.day_boat_plans
  for all to anon, authenticated using (true) with check (true);

create policy pilot_boat_assignments_all on public.boat_assignments
  for all to anon, authenticated using (true) with check (true);

create policy pilot_day_vehicle_plans_all on public.day_vehicle_plans
  for all to anon, authenticated using (true) with check (true);

create policy pilot_van_meta_all on public.van_meta
  for all to anon, authenticated using (true) with check (true);

create policy pilot_van_assignments_all on public.van_assignments
  for all to anon, authenticated using (true) with check (true);

create policy pilot_fleet_vans_all on public.fleet_vans
  for all to anon, authenticated using (true) with check (true);

create policy pilot_drivers_all on public.drivers
  for all to anon, authenticated using (true) with check (true);

create policy pilot_booking_cutoffs_all on public.booking_cutoffs
  for all to anon, authenticated using (true) with check (true);

create policy pilot_booking_closures_all on public.booking_closures
  for all to anon, authenticated using (true) with check (true);

create policy pilot_booking_events_all on public.booking_events
  for all to anon, authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- Seed mock data (agents + zones + 63 bookings) lives in supabase/seed.sql
-- After this file, run:  supabase/seed.sql
-- Or later: select public.seed_mock_data();
-- -----------------------------------------------------------------------------
