-- =============================================================================
-- G'day B2B Portal — mock seed (mirrors lib/mock-data.ts)
-- Run AFTER supabase/schema.sql
--
-- Booking codes: PP2609-0001 / JB2611-0002
--   = program (PP|JB) + travel year YY + month MM + '-' + 4-digit monthly sequence
--
-- Usage in Supabase SQL Editor:
--   1) Run this whole file once (creates function + seeds)
--   2) Later, re-seed with:  select public.seed_mock_data();
--   3) If old codes like JB-261122-001 remain, run:
--        supabase/normalize-booking-codes.sql
-- =============================================================================

create or replace function public.seed_mock_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agents int;
  v_zones int;
  v_bookings int;
begin
  insert into public.agents (slug, name, country, status) values
    ('abc-travel', 'ABC Travel India', 'India', 'Active'),
    ('golden-triangle', 'Golden Triangle Travel', 'India', 'Active'),
    ('mumbai-holidays', 'Mumbai Holidays', 'India', 'Active'),
    ('delhi-travel', 'Delhi Travel Group', 'India', 'Active')
  on conflict (slug) do update set
    name = excluded.name,
    country = excluded.country,
    status = excluded.status;

  insert into public.pickup_zones (name, time, pending, sort_order) values
    ('Patong', '07:30', false, 10),
    ('Kata', '07:45', false, 20),
    ('Karon', '08:00', false, 30),
    ('Other', 'Awaiting pickup time', true, 999)
  on conflict (name) do update set
    time = excluded.time,
    pending = excluded.pending,
    sort_order = excluded.sort_order;

  -- Drop legacy mock codes (PP-260917-001) so re-seed uses PP2609-0001 style.
  delete from public.bookings
  where code ~ '^(PP|JB)-[0-9]{6}-[0-9]+$';

  insert into public.bookings (
    code, agent_slug, agent_name, agent_ref, program, date,
    park_fee, canoe, adults, children, infants, tour_leaders,
    lead_guest, pickup_zone, pickup_hotel, room_number, note,
    pickup_time, status
  ) values
    ('PP2609-0001', 'abc-travel', 'ABC Travel India', 'ABC-1201', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'John Smith', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
    ('PP2609-0002', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1202', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Sanjay Patel', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('PP2609-0003', 'delhi-travel', 'Delhi Travel Group', 'DT-1203', 'PP', '2026-09-17', 'Included', null, 2, 1, 0, 0, 'Neha Gupta', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('PP2609-0004', 'golden-triangle', 'Golden Triangle Travel', 'GT-1204', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Arjun Reddy', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('PP2609-0005', 'abc-travel', 'ABC Travel India', 'ABC-1205', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Lisa Wong', 'Other', 'The Nai Harn', '', '', 'Awaiting pickup time', 'Pending Pickup Time'),
    ('PP2609-0006', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1206', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Vikram Shah', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('PP2609-0007', 'golden-triangle', 'Golden Triangle Travel', 'GT-1207', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Emma Clarke', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('PP2609-0008', 'abc-travel', 'ABC Travel India', 'ABC-1208', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Hiro Tanaka', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('PP2609-0009', 'delhi-travel', 'Delhi Travel Group', 'DT-1209', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Maria Santos', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('PP2609-0010', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1210', 'PP', '2026-09-17', 'Included', null, 1, 1, 0, 0, 'Omar Hassan', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
    ('PP2609-0011', 'golden-triangle', 'Golden Triangle Travel', 'GT-1211', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Chen Wei', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('PP2609-0012', 'abc-travel', 'ABC Travel India', 'ABC-1212', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Anna Kowalski', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('PP2609-0013', 'delhi-travel', 'Delhi Travel Group', 'DT-1213', 'PP', '2026-09-17', 'Included', null, 2, 0, 1, 0, 'Diego Alvarez', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
    ('PP2609-0014', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1214', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Priya Iyer', 'Other', 'Laguna Phuket', '', '', 'Awaiting pickup time', 'Pending Pickup Time'),
    ('PP2609-0015', 'golden-triangle', 'Golden Triangle Travel', 'GT-1215', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Tom Hughes', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('PP2609-0016', 'abc-travel', 'ABC Travel India', 'ABC-1216', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Sofia Ricci', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('PP2609-0017', 'delhi-travel', 'Delhi Travel Group', 'DT-1217', 'PP', '2026-09-17', 'Included', null, 2, 1, 0, 0, 'James Park', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('PP2609-0018', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1218', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Fatima Noor', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('PP2609-0019', 'golden-triangle', 'Golden Triangle Travel', 'GT-1219', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Lucas Meyer', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('PP2609-0020', 'abc-travel', 'ABC Travel India', 'ABC-1220', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Yuki Sato', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('PP2609-0021', 'delhi-travel', 'Delhi Travel Group', 'DT-1221', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Nora Lindqvist', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
    ('PP2609-0022', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1222', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Raj Malhotra', 'Other', 'The Nai Harn', '', '', 'Awaiting pickup time', 'Pending Pickup Time'),
    ('PP2609-0023', 'golden-triangle', 'Golden Triangle Travel', 'GT-1223', 'PP', '2026-09-17', 'Included', null, 1, 1, 0, 0, 'Chloe Dubois', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('PP2609-0024', 'abc-travel', 'ABC Travel India', 'ABC-1224', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Ben Carter', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
    ('PP2609-0025', 'delhi-travel', 'Delhi Travel Group', 'DT-1225', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Aisha Khan', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('PP2609-0026', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1226', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Marco Rossi', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('PP2609-0027', 'golden-triangle', 'Golden Triangle Travel', 'GT-1227', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Helen Cho', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('PP2609-0028', 'abc-travel', 'ABC Travel India', 'ABC-1228', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Ibrahim Ali', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('PP2609-0029', 'delhi-travel', 'Delhi Travel Group', 'DT-1229', 'PP', '2026-09-17', 'Included', null, 2, 2, 0, 0, 'Grace Kim', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('PP2609-0030', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1230', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Peter Novak', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('JB2609-0001', 'golden-triangle', 'Golden Triangle Travel', 'GT-1231', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 0, 0, 'Priya Nair', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('JB2609-0002', 'delhi-travel', 'Delhi Travel Group', 'DT-1232', 'James Bond', '2026-09-17', 'Included', 'Not Included', 1, 0, 0, 0, 'Amit Verma', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('JB2609-0003', 'abc-travel', 'ABC Travel India', 'ABC-1233', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 1, 0, 0, 'Sophie Martin', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('JB2609-0004', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1234', 'James Bond', '2026-09-17', 'Included', 'Included', 1, 0, 0, 0, 'Ken Watanabe', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
    ('JB2609-0005', 'golden-triangle', 'Golden Triangle Travel', 'GT-1235', 'James Bond', '2026-09-17', 'Included', 'Not Included', 2, 0, 0, 0, 'Lara Costa', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('JB2609-0006', 'abc-travel', 'ABC Travel India', 'ABC-1236', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 0, 0, 'Daniel Lee', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('JB2609-0007', 'delhi-travel', 'Delhi Travel Group', 'DT-1237', 'James Bond', '2026-09-17', 'Included', 'Included', 1, 1, 0, 0, 'Maya Singh', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
    ('JB2609-0008', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1238', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 0, 1, 'Oliver Brown', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('JB2609-0009', 'golden-triangle', 'Golden Triangle Travel', 'GT-1239', 'James Bond', '2026-09-17', 'Included', 'Not Included', 1, 0, 0, 0, 'Ines Dubois', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('JB2609-0010', 'abc-travel', 'ABC Travel India', 'ABC-1240', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 0, 0, 'Samir Patel', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('JB2609-0011', 'delhi-travel', 'Delhi Travel Group', 'DT-1241', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 1, 0, 'Nina Volkov', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('JB2609-0012', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1242', 'James Bond', '2026-09-17', 'Included', 'Not Included', 1, 0, 0, 0, 'Jack Wilson', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('PP2609-0031', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1243', 'PP', '2026-09-18', 'Not Included', null, 10, 2, 0, 1, 'Rahul Mehta', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('JB2609-0013', 'delhi-travel', 'Delhi Travel Group', 'DT-1244', 'James Bond', '2026-09-18', 'Included', 'Not Included', 6, 1, 1, 0, 'Ananya Sharma', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('PP2609-0032', 'abc-travel', 'ABC Travel India', 'ABC-1245', 'PP', '2026-09-19', 'Included', null, 12, 4, 0, 1, 'David Chen', 'Other', 'Laguna Phuket', '', '', 'Awaiting pickup time', 'Pending Pickup Time'),
    ('PP2608-0001', 'abc-travel', 'ABC Travel India', 'ABC-1247', 'PP', '2026-08-15', 'Included', null, 6, 2, 0, 1, 'Arjun Patel', 'Patong', 'Burasari Resort', '', '', '07:30', 'Confirmed'),
    ('JB2608-0001', 'golden-triangle', 'Golden Triangle Travel', 'GT-1248', 'James Bond', '2026-08-16', 'Included', 'Included', 4, 1, 0, 0, 'Sana Kapoor', 'Kata', 'Kata Thani', '', '', '07:45', 'Confirmed'),
    ('PP2608-0002', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1249', 'PP', '2026-08-22', 'Not Included', null, 8, 3, 1, 1, 'Neha Joshi', 'Karon', 'Hilton Phuket Arcadia', '', '', '08:00', 'Confirmed'),
    ('JB2608-0002', 'delhi-travel', 'Delhi Travel Group', 'DT-1250', 'James Bond', '2026-08-28', 'Included', 'Not Included', 7, 0, 0, 1, 'Vikram Singh', 'Patong', 'Amari Phuket', '', '', '07:30', 'Confirmed'),
    ('PP2609-0033', 'delhi-travel', 'Delhi Travel Group', 'DT-1251', 'PP', '2026-09-05', 'Included', null, 5, 1, 0, 0, 'Meera Iyer', 'Kata', 'Mom Tri''s Villa Royale', '', '', '07:45', 'Confirmed'),
    ('JB2609-0015', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1252', 'James Bond', '2026-09-10', 'Included', 'Included', 3, 2, 1, 0, 'Karan Malhotra', 'Other', 'Trisara Phuket', '', '', 'Awaiting pickup time', 'Pending Pickup Time')
  on conflict (code) do update set
    agent_slug = excluded.agent_slug,
    agent_name = excluded.agent_name,
    agent_ref = excluded.agent_ref,
    program = excluded.program,
    date = excluded.date,
    park_fee = excluded.park_fee,
    canoe = excluded.canoe,
    adults = excluded.adults,
    children = excluded.children,
    infants = excluded.infants,
    tour_leaders = excluded.tour_leaders,
    lead_guest = excluded.lead_guest,
    pickup_zone = excluded.pickup_zone,
    pickup_hotel = excluded.pickup_hotel,
    room_number = excluded.room_number,
    note = excluded.note,
    pickup_time = excluded.pickup_time,
    status = excluded.status;

  select count(*) into v_agents from public.agents;
  select count(*) into v_zones from public.pickup_zones;
  select count(*) into v_bookings from public.bookings;

  return jsonb_build_object(
    'ok', true,
    'agents', v_agents,
    'pickup_zones', v_zones,
    'bookings', v_bookings,
    'seeded_booking_codes', 51
  );
end;
$$;

revoke all on function public.seed_mock_data() from public;
grant execute on function public.seed_mock_data() to anon, authenticated, service_role;

-- Run seed immediately
select public.seed_mock_data();
