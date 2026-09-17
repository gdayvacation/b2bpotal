-- =============================================================================
-- Hotels: create table + seed catalog (run once in Supabase SQL Editor)
-- =============================================================================

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

alter table public.hotels enable row level security;

drop policy if exists pilot_hotels_all on public.hotels;
create policy pilot_hotels_all on public.hotels
  for all to anon, authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- Catalog (deduped from partner history). null zone = admin assigns later.
-- -----------------------------------------------------------------------------
insert into public.hotels (name, zone_name, active, sort_order) values
  ('Amari Phuket', 'Patong', true, 10),
  ('Andakira Hotel Phuket', 'Patong', true, 20),
  ('Andaman Beach Hotel Phuket', 'Patong', true, 30),
  ('Andaman Embrace Patong', 'Patong', true, 40),
  ('Andamantra Resort and Villa Phuket', 'Patong', true, 50),
  ('Ashlee Plaza Patong Hotel & Spa', 'Patong', true, 60),
  ('Aspery Hotel Phuket', 'Patong', true, 70),
  ('Baan Yuree Resort', 'Patong', true, 80),
  ('Beachcomber Phuket', 'Patong', true, 90),
  ('Bel Aire Patong, Phuket', 'Patong', true, 100),
  ('Best Western Patong Beach', 'Patong', true, 110),
  ('Citrus Patong Hotel By Compass Hospitality', 'Patong', true, 120),
  ('Deevana Plaza Phuket', 'Patong', true, 130),
  ('Elite Suites Patong, Phuket', 'Patong', true, 140),
  ('Fishermen''s Harbour', 'Patong', true, 150),
  ('Four Points by Sheraton', 'Patong', true, 160),
  ('Grand Mercure Phuket', 'Patong', true, 170),
  ('Grand Orchid Inn Hotel', 'Patong', true, 180),
  ('Holiday Inn Express Phuket', 'Patong', true, 190),
  ('M Social Phuket', 'Patong', true, 200),
  ('Malabar Pool Villa Phuket', 'Patong', true, 210),
  ('Mercure Phuket Patong Journeyhub', 'Patong', true, 220),
  ('Nipa Resort Phuket', 'Patong', true, 230),
  ('Patong Bay Hill', 'Patong', true, 240),
  ('Patong Bay Residence', 'Patong', true, 250),
  ('Patong Lodge Hotel', 'Patong', true, 260),
  ('Patong Resort', 'Patong', true, 270),
  ('Sunshine Patong', 'Patong', true, 280),
  ('The AIM Patong Hotel', 'Patong', true, 290),
  ('Zenseana Phuket Hotel', 'Patong', true, 300),
  ('Zostel Phuket Hostel', 'Patong', true, 310),
  ('Mandarava Resort & Spa Phuket', 'Kata', true, 400),
  ('Chanalai Hillside Resort', 'Karon', true, 500),
  ('Peach Hill Hotel & Resort', 'Karon', true, 510),
  ('Princess Seaview Resort and Spa', 'Karon', true, 520),
  ('Thavorn Palm Beach Resort Phuket', 'Karon', true, 530),
  ('Utopia Karon', 'Karon', true, 540),
  ('La Vista', null, true, 900),
  ('Marriott Merlin Beach', null, true, 910),
  ('Radisson Resort and Suites Phuket', null, true, 920)
on conflict ((lower(trim(name)))) do update set
  zone_name = excluded.zone_name,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());
