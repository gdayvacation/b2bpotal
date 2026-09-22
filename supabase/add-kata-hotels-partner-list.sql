-- Partner Kata hotel list (added 22 Sep 2026).
-- Safe-ish to re-run: unique on lower(trim(name)).

insert into public.hotels (name, zone_name, active, sort_order)
values
  ('The Shore at Katathani', 'Kata', true, 6000),
  ('Katathani Phuket Beach Resort', 'Kata', true, 6010),
  ('Kata Rocks Resort & Residences', 'Kata', true, 6020),
  ('The SIS Kata Resort', 'Kata', true, 6030),
  ('Impiana Private Villas Kata Noi', 'Kata', true, 6040),
  ('Malisa Villa Resort', 'Kata', true, 6050),
  ('Avista Grande Phuket Karon - MGallery', 'Kata', true, 6060),
  ('The Boathouse Phuket', 'Kata', true, 6070),
  ('Beyond Resort Kata', 'Kata', true, 6080),
  ('Metadee Concept Hotel', 'Kata', true, 6090),
  ('Metadee Resort & Villas', 'Kata', true, 6100),
  ('Centara Kata Resort Phuket', 'Kata', true, 6110),
  ('The Sea Galleri by Katathani', 'Kata', true, 6120),
  ('Grand Kata VIP - Kata Beach', 'Kata', true, 6130),
  ('OZO Phuket', 'Kata', true, 6140),
  ('Chanalai Garden Resort, Kata Beach', 'Kata', true, 6150),
  ('Chanalai Romantica Resort', 'Kata', true, 6160),
  ('Mom Tri''s Villa Royale', 'Kata', true, 6170),
  ('Chanalai Flora Resort, Kata Beach', 'Kata', true, 6180),
  ('The Baray Villa by Sawasdee Village', 'Kata', true, 6190),
  ('Sawasdee Village', 'Kata', true, 6200),
  ('The Beach Heights Resort', 'Kata', true, 6210),
  ('Pamookkoo Resort', 'Kata', true, 6220),
  ('Sugar Marina Resort - SURF - Kata Beach', 'Kata', true, 6230),
  ('Sugar Marina Resort - NAUTICAL - Kata Beach', 'Kata', true, 6240),
  ('Sugar Marina Resort - FASHION - Kata Beach', 'Kata', true, 6250),
  ('Aurico Kata Resort & Spa', 'Kata', true, 6260),
  ('Kata Palm Resort & Spa', 'Kata', true, 6270),
  ('The Focus Housing Kata', 'Kata', true, 6280),
  ('Must Sea Hotel', 'Kata', true, 6290)
on conflict do nothing;

-- Existing close matches stay on Kata
update public.hotels
set zone_name = 'Kata'
where lower(trim(name)) in (
  lower('Kata Sea Breeze Resort'),
  lower('Novotel Phuket Kata Avista')
);
