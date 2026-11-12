-- Merge duplicate hotels (bookings are repointed to the kept name), then add missing Phuket hotels.
-- Runs as one statement so it works in the Supabase SQL editor (no session temp tables).

do $$
begin

drop table if exists pg_temp.hotel_merge;
create temp table hotel_merge (drop_name text, keep_name text);
insert into hotel_merge (drop_name, keep_name) values
  ('Andamantra Resort & Villa Phuket', 'Andamantra Resort and Villa Phuket'),
  ('At Ease Phuket Patong', 'AtEase Phuket Patong'),
  ('Princess Sea view Resort and spa', 'Princess Seaview Resort and Spa'),
  ('Radisson Resort and Suites Phuket', 'Radisson Resort & Suites Phuket'),
  ('ASHLEE Heights Hotel Patong', 'The Ashlee Heights Patong Hotel & Suites'),
  ('Chanalai Hillside Resort Karon Beach', 'Chanalai Hillside Resort'),
  ('Crest Resort and Pool Villas Phuket', 'Crest Resort & Pool Villas'),
  ('Elite Suites Hotel', 'Elite Suites Patong'),
  ('Gu Hotel Phuket', 'GU HOTEL'),
  ('Marriott Merlin Beach', 'Phuket Marriott Resort & Spa, Merlin Beach'),
  ('Porter House Beach Hotel', 'Porterhouse Beach Hotel Patong'),
  ('TRIBE Phuket Patong by Accor', 'Tribe Phuket Patong'),
  ('Zenseana Phuket Hotel', 'Zenseana Resort & Spa'),
  ('Zenseana resort & spa', 'Zenseana Resort & Spa');

update hotels set name = 'Zenseana Resort & Spa', updated_at = timezone('utc', now())
where name = 'Zenseana resort & spa';

update bookings b set pickup_hotel = m.keep_name
from hotel_merge m
where lower(b.pickup_hotel) = lower(m.drop_name);

delete from hotels h
using hotel_merge m
where h.name = m.drop_name and m.drop_name <> m.keep_name
  and lower(m.drop_name) <> lower(m.keep_name)
  and exists (select 1 from hotels k where lower(k.name) = lower(m.keep_name));

insert into hotels (name, zone_name)
select v.name, v.zone_name
from (values
  -- Patong
  ('Swissotel Resort Phuket Patong Beach', 'Patong'),
  ('Riders Lodge Phuket', 'Patong'),
  ('Thara Patong Beach Resort & Spa', 'Patong'),
  ('The Bay and Beach Club Phuket', 'Patong'),
  ('Tropica Bungalow Beach Hotel', 'Patong'),
  ('Andatel Grande Patong', 'Patong'),
  ('Sharaya Patong', 'Patong'),
  ('Mantra Pura Resort', 'Patong'),
  ('Avantika Boutique Hotel', 'Patong'),
  ('Bayshore Ocean View Hotel', 'Patong'),
  ('Rayaburi Hotel Patong', 'Patong'),
  ('Baan Pronphateep', 'Patong'),
  ('Phuket Paradise Hotel', 'TriTrang'),
  -- Karon
  ('Mövenpick Resort & Spa Karon Beach', 'Karon'),
  ('Karon Beach Resort & Spa', 'Karon'),
  ('Centara Villas Phuket', 'Karon'),
  ('Beyond Resort Karon', 'Karon'),
  ('Sugar Marina Resort - ART - Karon Beach', 'Karon'),
  ('Woraburi Phuket Resort & Spa', 'Karon'),
  ('The Old Phuket Karon Beach Resort', 'Karon'),
  ('In On The Beach Karon', 'Karon'),
  ('Phuket Island View Resort', 'Karon'),
  ('Karon Princess Hotel', 'Karon'),
  ('Ramada by Wyndham Phuket Southsea', 'Karon'),
  ('Marina Phuket Resort', 'Karon'),
  -- Kata
  ('Kata Beach Resort & Spa', 'Kata'),
  ('Club Med Phuket', 'Kata'),
  ('ibis Phuket Kata', 'Kata'),
  ('Sugar Palm Grand Hillside', 'Kata'),
  ('Orchidacea Resort', 'Kata'),
  -- Kamala
  ('Swissotel Resort Phuket Kamala Beach', 'Kamala'),
  ('Sunprime Kamala Beach', 'Kamala'),
  ('Cape Sienna Gourmet Hotel & Villas', 'Kamala'),
  ('Keemala', 'Kamala'),
  ('Paresa Resort', 'Kamala'),
  ('Ayara Kamala', 'Kamala'),
  ('Andara Resort & Villas', 'Kamala'),
  -- Surin, Bangtao, Laguna, Layan, Mai Khao, Nai Yang, Nai Thon, Panwa
  ('Twinpalms Phuket', 'private tranfer only'),
  ('The Surin Phuket', 'private tranfer only'),
  ('Manathai Surin', 'private tranfer only'),
  ('Amanpuri', 'private tranfer only'),
  ('Banyan Tree Phuket', 'private tranfer only'),
  ('Angsana Laguna Phuket', 'private tranfer only'),
  ('Dusit Thani Laguna Phuket', 'private tranfer only'),
  ('Outrigger Laguna Phuket Beach Resort', 'private tranfer only'),
  ('Cassia Phuket', 'private tranfer only'),
  ('Laguna Holiday Club Phuket Resort', 'private tranfer only'),
  ('Mövenpick Resort Bangtao Beach', 'private tranfer only'),
  ('Hilton Garden Inn Phuket Bang Tao', 'private tranfer only'),
  ('Anantara Layan Phuket Resort', 'private tranfer only'),
  ('Trisara', 'private tranfer only'),
  ('The Pavilions Phuket', 'private tranfer only'),
  ('Anantara Mai Khao Phuket Villas', 'private tranfer only'),
  ('SALA Phuket Mai Khao Beach Resort', 'private tranfer only'),
  ('Renaissance Phuket Resort & Spa', 'private tranfer only'),
  ('Centara Grand West Sands Resort & Villas Phuket', 'private tranfer only'),
  ('Splash Beach Resort', 'private tranfer only'),
  ('The Slate', 'private tranfer only'),
  ('Dewa Phuket', 'private tranfer only'),
  ('Pullman Phuket Arcadia Naithon Beach', 'private tranfer only'),
  ('Sri Panwa Phuket', 'private tranfer only'),
  ('The Village Coconut Island', 'private tranfer only'),
  -- South
  ('The Nai Harn', 'Nai Harn'),
  ('All Seasons Naiharn Phuket', 'Nai Harn'),
  ('Vijitt Resort Phuket', 'Rawai'),
  ('Rawai Palm Beach Resort', 'Rawai'),
  ('Wyndham La Vita Phuket', 'Rawai'),
  ('The Westin Siray Bay Resort & Spa', 'Sirey'),
  -- Phuket Town
  ('Novotel Phuket City Phokeethra', 'Phuket town'),
  ('Ramada Plaza by Wyndham Chao Fah', 'Phuket town'),
  ('The Memory at On On Hotel', 'Phuket town'),
  ('Metropole Hotel Phuket', 'Phuket town')
) as v(name, zone_name)
where not exists (select 1 from hotels h where lower(h.name) = lower(v.name));

drop table hotel_merge;

end
$$;
