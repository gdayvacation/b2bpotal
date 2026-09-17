-- =============================================================================
-- Seed hotel catalog (deduped from partner booking history)
-- Zones: Patong / Kata / Karon — null = admin must assign
--
-- Prerequisites: pickup_zones seeded; hotels table exists
--   (schema.sql or add-hotels.sql)
-- Run:  supabase/seed-hotels.sql
-- =============================================================================

insert into public.hotels (name, zone_name, active, sort_order) values
  -- Patong
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
  -- Kata
  ('Mandarava Resort & Spa Phuket', 'Kata', true, 400),
  -- Karon
  ('Chanalai Hillside Resort', 'Karon', true, 500),
  ('Peach Hill Hotel & Resort', 'Karon', true, 510),
  ('Princess Seaview Resort and Spa', 'Karon', true, 520),
  ('Thavorn Palm Beach Resort Phuket', 'Karon', true, 530),
  ('Utopia Karon', 'Karon', true, 540),
  -- Unassigned (admin to set zone)
  ('La Vista', null, true, 900),
  ('Marriott Merlin Beach', null, true, 910),
  ('Radisson Resort and Suites Phuket', null, true, 920)
on conflict ((lower(trim(name)))) do update set
  zone_name = excluded.zone_name,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());
