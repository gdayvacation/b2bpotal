-- SUPERSEDED by supabase/seed-sep2026-pp-excel.sql
-- Do not run. The screenshot import for 1 Sept was replaced by the Excel workbook.
--
-- Phi Phi bookings from old job sheet ใบงาน 1/9/2026.
-- Safe to re-run: replaces 1 Sept 2026 PP bookings, then inserts these 13 rows.
-- Zone column from the sheet is ignored — pickup_zone comes from the hotel catalog
-- (Other when the hotel has no zone yet).
--
-- Park fee: "Excluding National Park Fee" → Not Included (portal calculates 400/200).
-- COT on those rows is the park-fee total, so it is NOT copied into cash_on_tour.
-- Other COT amounts (800 / 1,500 / 2,200) are stored as cash on tour.
--
-- Run in Supabase SQL Editor.

insert into public.agents (slug, name, country, status) values
  ('goodday', 'Goodday', '', 'Active'),
  ('starday', 'Starday', '', 'Active'),
  ('booking', 'Booking', '', 'Active'),
  ('window', 'Window', '', 'Active'),
  ('unknown', 'Unknown', '', 'Active')
on conflict (slug) do update set
  name = excluded.name,
  status = excluded.status;

insert into public.pickup_zones (name, time, pending, sort_order) values
  ('Other', 'Awaiting pickup time', true, 999)
on conflict (name) do nothing;

delete from public.boat_assignments
where booking_code in (
  select code from public.bookings
  where date = '2026-09-01' and program = 'PP'
);

delete from public.van_assignments
where booking_code in (
  select code from public.bookings
  where date = '2026-09-01' and program = 'PP'
);

delete from public.bookings
where date = '2026-09-01' and program = 'PP';

with seq as (
  select coalesce(max((regexp_match(code, '^PP2609-([0-9]+)$'))[1]::int), 0) as n
  from public.bookings
  where code ~ '^PP2609-[0-9]+$'
),
sheet as (
  select * from (
    values
      -- sort, agent_slug, agent_name, agent_ref, adults, children, infants, guest, hotel, zone, pickup, park, cot, extra, note
      (
        1, 'goodday', 'Goodday', 'GDV-136504',
        2, 2, 0, 'Amit Kumar',
        'Radisson Resort and Suites Phuket', 'Other', '07:30',
        'Included', '', 'Extra Charge 300pax', 'Group · Extra Charge 300pax'
      ),
      (
        2, 'starday', 'Starday', '4157672',
        2, 0, 1, 'Kamal Kumar Sachdeva',
        'Andamantra Resort and Villa Phuket', 'Patong', '08:00',
        'Included', '', '', 'WhatsApp +91 98109 763309 · เผด็จ 31-4278 / 0606148864'
      ),
      (
        3, 'unknown', 'Unknown', 'NO.176363',
        6, 0, 0, 'Visagapandi Pillay',
        'Zenseana Phuket Hotel', 'Patong', '08:00',
        'Included', '', '', ''
      ),
      (
        4, 'goodday', 'Goodday', 'GDV-136503',
        2, 0, 0, 'Dinakar Reddy Baliganipalli',
        'Patong Bay Residence', 'Patong', '08:00',
        'Included', '800 THB', '', 'WhatsApp +970491 995226'
      ),
      (
        5, 'booking', 'Booking', 'BWTH1254404',
        2, 0, 0, 'Sambandha Regimi',
        'Bel Aire Patong, Phuket', 'Patong', '08:00',
        'Not Included', '', '', 'Excluding National Park Fee'
      ),
      (
        6, 'booking', 'Booking', 'BWTH1254902',
        2, 0, 0, 'Sanjoog Basnet',
        'Bel Aire Patong, Phuket', 'Patong', '08:00',
        'Not Included', '', '', 'Excluding National Park Fee · น้องอาร์ม 30-6640 / 0660427113'
      ),
      (
        7, 'booking', 'Booking', 'BWTH1262277',
        2, 0, 0, 'Akash Komer',
        'Holiday Inn Express Phuket', 'Patong', '08:00',
        'Not Included', '', '', 'Excluding National Park Fee'
      ),
      (
        8, 'booking', 'Booking', 'BWTH1282618',
        3, 0, 0, 'Akshay Kumar Kapoor',
        'Holiday Inn Express Phuket', 'Patong', '08:00',
        'Not Included', '', '', 'Excluding National Park Fee'
      ),
      (
        9, 'window', 'Window', 'BWTH1260378',
        2, 0, 0, 'Lekha Kumar Thapas',
        'Sunshine Patong', 'Patong', '08:00',
        'Not Included', '', '', 'Excluding National Park Fee · พี่เอก 31-5229 / 0968956310'
      ),
      (
        10, 'starday', 'Starday', '4310546',
        2, 2, 1, 'Rahul Khurana',
        'Elite Suites Patong, Phuket', 'Patong', '08:00',
        'Included', '1,500 THB', '', 'WhatsApp +91 87913 278110'
      ),
      (
        11, 'goodday', 'Goodday', 'T00204',
        2, 0, 0, 'K-Sonya',
        'Marriott Merlin Beach', 'Other', '07:45',
        'Included', '2,200 THB', '', 'TTTT · Cash on tour · พี่เอม 31-4277 / 0635259693'
      ),
      (
        12, 'booking', 'Booking', 'BWTH1260383',
        2, 1, 0, 'Amab Sengupta',
        'Mercure Phuket Patong Journeyhub', 'Patong', '08:00',
        'Not Included', '', '', 'Excluding National Park Fee'
      ),
      (
        13, 'goodday', 'Goodday', 'GDV-136505',
        2, 0, 0, 'Inderpal Singh Gill',
        'Mercure Phuket Patong Journeyhub', 'Patong', '08:00',
        'Included', '', '', 'WhatsApp +1 978 836 4223'
      )
  ) as t (
    sort, agent_slug, agent_name, agent_ref,
    adults, children, infants, lead_guest,
    pickup_hotel, pickup_zone, pickup_time,
    park_fee, cash_on_tour, transfer_extra_charge, note
  )
),
numbered as (
  select sheet.sort as i, sheet.*
  from sheet
)
insert into public.bookings (
  code, agent_slug, agent_name, agent_ref, program, date,
  park_fee, canoe, adults, children, infants, tour_leaders,
  lead_guest, pickup_zone, pickup_hotel, room_number, note,
  cash_on_tour, transfer_extra_charge, pickup_time, status
)
select
  'PP2609-' || lpad((seq.n + numbered.i)::text, 4, '0'),
  numbered.agent_slug,
  numbered.agent_name,
  numbered.agent_ref,
  'PP',
  '2026-09-01',
  numbered.park_fee,
  null,
  numbered.adults,
  numbered.children,
  numbered.infants,
  0,
  numbered.lead_guest,
  numbered.pickup_zone,
  numbered.pickup_hotel,
  '',
  numbered.note,
  numbered.cash_on_tour,
  numbered.transfer_extra_charge,
  numbered.pickup_time,
  'Confirmed'
from numbered
cross join seq;

select
  code,
  agent_name,
  agent_ref,
  lead_guest,
  adults,
  children,
  infants,
  pickup_hotel,
  pickup_zone,
  park_fee,
  cash_on_tour
from public.bookings
where date = '2026-09-01' and program = 'PP'
order by code;
