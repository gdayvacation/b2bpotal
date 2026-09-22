-- Add partner Patong hotels that were missing from the catalog (23 Sep 2026 list).
-- Safe to re-run: unique on lower(trim(name)).

insert into public.hotels (name, zone_name, active, sort_order)
values
  ('Royal Phawadee Village Hotel', 'Patong', true, 5000),
  ('Patong Hemingways Hotel', 'Patong', true, 5010),
  ('Grand Tower Inn Patong', 'Patong', true, 5020),
  ('Bauman Residence', 'Patong', true, 5030),
  ('The Ashlee Heights Patong Hotel & Suites', 'Patong', true, 5040),
  ('Poppa Palace Hotel', 'Patong', true, 5050),
  ('Baramee Resort', 'Patong', true, 5060),
  ('Seven Seas Hotel Patong', 'Patong', true, 5070),
  ('The Album Hotel', 'Patong', true, 5080),
  ('Belvedere Guest House', 'Patong', true, 5090),
  ('Patong Max Value Hotel, Patong Beach', 'Patong', true, 5100),
  ('Anchor Boutique House', 'Patong', true, 5110),
  ('GP House Phuket', 'Patong', true, 5120),
  ('GU HOTEL', 'Patong', true, 5130),
  ('FunDee Boutique Hotel', 'Patong', true, 5140),
  ('Centre Point Hotel Patong Beach', 'Patong', true, 5150),
  ('The Elegant Patong', 'Patong', true, 5160),
  ('Neptuna Hotel', 'Patong', true, 5170),
  ('Breezotel', 'Patong', true, 5180),
  ('Patong Backpacker Hostel', 'Patong', true, 5190),
  ('Siras Room Patong', 'Patong', true, 5200),
  ('Amici Miei Hotel', 'Patong', true, 5210),
  ('The Bird Spazzio Hotel', 'Patong', true, 5220),
  ('Patong Pearl Hotel', 'Patong', true, 5230),
  ('Riders Lodge Phuket', 'Patong', true, 5240),
  ('Tiras Patong Beach Hotel', 'Patong', true, 5250),
  ('Burasari Phuket', 'Patong', true, 5260),
  ('Impiana Resort Patong Phuket', 'Patong', true, 5270),
  ('Patong Merlin Hotel', 'Patong', true, 5280),
  ('Patong Beach Hotel', 'Patong', true, 5290),
  ('The Block Hotel', 'Patong', true, 5300),
  ('The Signature Hotel Patong', 'Patong', true, 5310),
  ('Bauman Casa Beach Resort', 'Patong', true, 5320),
  ('Horizon Patong Beach Resort & Spa', 'Patong', true, 5330),
  ('Safari Beach Hotel', 'Patong', true, 5340),
  ('Phuket Gazette Resort Patong', 'Patong', true, 5350),
  ('Dinso Resort & Villas Phuket', 'Patong', true, 5360),
  ('Phuket Marriott Resort & Spa, Merlin Beach', 'Patong', true, 5370),
  ('Kudo Hotel & Beach Club', 'Patong', true, 5380),
  ('Swissotel Resort Phuket Patong Beach', 'Patong', true, 5390),
  ('The Senses Resort & Pool Villas', 'Patong', true, 5400),
  ('Rosewood Phuket', 'Patong', true, 5410)
on conflict do nothing;

-- Ensure listed hotels that already existed are on Patong zone
update public.hotels
set zone_name = 'Patong'
where lower(trim(name)) in (
  lower('Absolute Twin Sands Resort & Spa'),
  lower('Sunset Beach Resort'),
  lower('Kalima Resort and Spa'),
  lower('Crest Resort & Pool Villas'),
  lower('Wyndham Grand Phuket Kalim Bay'),
  lower('Avista Hideaway Phuket Patong')
);
