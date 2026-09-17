-- =============================================================================
-- G'day B2B Portal — mock seed (mirrors lib/mock-data.ts)
-- Run AFTER supabase/schema.sql
--
-- Usage in Supabase SQL Editor:
--   1) Run this whole file once (creates function + seeds)
--   2) Later, re-seed with:  select public.seed_mock_data();
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
    ('Other', 'Pending Confirmation', true, 999)
  on conflict (name) do update set
    time = excluded.time,
    pending = excluded.pending,
    sort_order = excluded.sort_order;

  insert into public.bookings (
    code, agent_slug, agent_name, agent_ref, program, date,
    park_fee, canoe, adults, children, infants, tour_leaders,
    lead_guest, pickup_zone, pickup_hotel, room_number, note,
    pickup_time, status
  ) values
    ('PP-260917-001', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'John Smith', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
    ('PP-260917-002', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Sanjay Patel', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('PP-260917-003', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-09-17', 'Included', null, 2, 1, 0, 0, 'Neha Gupta', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('PP-260917-004', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Arjun Reddy', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('PP-260917-005', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Lisa Wong', 'Other', 'The Nai Harn', '', '', 'Pending Confirmation', 'Pending Pickup Time'),
    ('PP-260917-006', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Vikram Shah', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('PP-260917-007', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Emma Clarke', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('PP-260917-008', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Hiro Tanaka', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('PP-260917-009', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Maria Santos', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('PP-260917-010', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-17', 'Included', null, 1, 1, 0, 0, 'Omar Hassan', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
    ('PP-260917-011', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Chen Wei', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('PP-260917-012', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Anna Kowalski', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('PP-260917-013', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 1, 0, 'Diego Alvarez', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
    ('PP-260917-014', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Priya Iyer', 'Other', 'Laguna Phuket', '', '', 'Pending Confirmation', 'Pending Pickup Time'),
    ('PP-260917-015', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Tom Hughes', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('PP-260917-016', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Sofia Ricci', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('PP-260917-017', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-09-17', 'Included', null, 2, 1, 0, 0, 'James Park', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('PP-260917-018', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Fatima Noor', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('PP-260917-019', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Lucas Meyer', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('PP-260917-020', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Yuki Sato', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('PP-260917-021', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Nora Lindqvist', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
    ('PP-260917-022', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Raj Malhotra', 'Other', 'The Nai Harn', '', '', 'Pending Confirmation', 'Pending Pickup Time'),
    ('PP-260917-023', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-09-17', 'Included', null, 1, 1, 0, 0, 'Chloe Dubois', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('PP-260917-024', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Ben Carter', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
    ('PP-260917-025', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Aisha Khan', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('PP-260917-026', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-17', 'Not Included', null, 2, 0, 0, 0, 'Marco Rossi', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('PP-260917-027', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Helen Cho', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('PP-260917-028', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-17', 'Included', null, 1, 0, 0, 0, 'Ibrahim Ali', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('PP-260917-029', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-09-17', 'Included', null, 2, 2, 0, 0, 'Grace Kim', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('PP-260917-030', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-17', 'Included', null, 2, 0, 0, 0, 'Peter Novak', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('JB-260917-001', 'golden-triangle', 'Golden Triangle Travel', '', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 0, 0, 'Priya Nair', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('JB-260917-002', 'delhi-travel', 'Delhi Travel Group', '', 'James Bond', '2026-09-17', 'Included', 'Not Included', 1, 0, 0, 0, 'Amit Verma', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('JB-260917-003', 'abc-travel', 'ABC Travel India', '', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 1, 0, 0, 'Sophie Martin', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('JB-260917-004', 'mumbai-holidays', 'Mumbai Holidays', '', 'James Bond', '2026-09-17', 'Included', 'Included', 1, 0, 0, 0, 'Ken Watanabe', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
    ('JB-260917-005', 'golden-triangle', 'Golden Triangle Travel', '', 'James Bond', '2026-09-17', 'Included', 'Not Included', 2, 0, 0, 0, 'Lara Costa', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('JB-260917-006', 'abc-travel', 'ABC Travel India', '', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 0, 0, 'Daniel Lee', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('JB-260917-007', 'delhi-travel', 'Delhi Travel Group', '', 'James Bond', '2026-09-17', 'Included', 'Included', 1, 1, 0, 0, 'Maya Singh', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
    ('JB-260917-008', 'mumbai-holidays', 'Mumbai Holidays', '', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 0, 1, 'Oliver Brown', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
    ('JB-260917-009', 'golden-triangle', 'Golden Triangle Travel', '', 'James Bond', '2026-09-17', 'Included', 'Not Included', 1, 0, 0, 0, 'Ines Dubois', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('JB-260917-010', 'abc-travel', 'ABC Travel India', '', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 0, 0, 'Samir Patel', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('JB-260917-011', 'delhi-travel', 'Delhi Travel Group', '', 'James Bond', '2026-09-17', 'Included', 'Included', 2, 0, 1, 0, 'Nina Volkov', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('JB-260917-012', 'mumbai-holidays', 'Mumbai Holidays', '', 'James Bond', '2026-09-17', 'Included', 'Not Included', 1, 0, 0, 0, 'Jack Wilson', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
    ('PP-260918-001', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-09-18', 'Not Included', null, 10, 2, 0, 1, 'Rahul Mehta', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
    ('JB-260918-002', 'delhi-travel', 'Delhi Travel Group', '', 'James Bond', '2026-09-18', 'Included', 'Not Included', 6, 1, 1, 0, 'Ananya Sharma', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('PP-260919-001', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-09-19', 'Included', null, 12, 4, 0, 1, 'David Chen', 'Other', 'Laguna Phuket', '', '', 'Pending Confirmation', 'Pending Pickup Time'),
    ('JB-260920-001', 'golden-triangle', 'Golden Triangle Travel', '', 'James Bond', '2026-09-20', 'Included', 'Included', 4, 0, 0, 0, 'Michael Tan', 'Kata', 'The Shore Residences', '', '', '07:45', 'Confirmed'),
    ('PP-260815-001', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-08-15', 'Included', null, 6, 2, 0, 1, 'Arjun Patel', 'Patong', 'Burasari Resort', '', '', '07:30', 'Confirmed'),
    ('JB-260816-001', 'golden-triangle', 'Golden Triangle Travel', '', 'James Bond', '2026-08-16', 'Included', 'Included', 4, 1, 0, 0, 'Sana Kapoor', 'Kata', 'Kata Thani', '', '', '07:45', 'Confirmed'),
    ('PP-260822-001', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-08-22', 'Not Included', null, 8, 3, 1, 1, 'Neha Joshi', 'Karon', 'Hilton Phuket Arcadia', '', '', '08:00', 'Confirmed'),
    ('JB-260828-001', 'delhi-travel', 'Delhi Travel Group', '', 'James Bond', '2026-08-28', 'Included', 'Not Included', 7, 0, 0, 1, 'Vikram Singh', 'Patong', 'Amari Phuket', '', '', '07:30', 'Confirmed'),
    ('PP-260905-001', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-09-05', 'Included', null, 5, 1, 0, 0, 'Meera Iyer', 'Kata', 'Mom Tri''s Villa Royale', '', '', '07:45', 'Confirmed'),
    ('JB-260910-001', 'mumbai-holidays', 'Mumbai Holidays', '', 'James Bond', '2026-09-10', 'Included', 'Included', 3, 2, 1, 0, 'Karan Malhotra', 'Other', 'Trisara Phuket', '', '', 'Pending Confirmation', 'Pending Pickup Time'),
    ('PP-260925-001', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-09-25', 'Included', null, 9, 2, 0, 1, 'Anita Rao', 'Patong', 'Indigo Pearl', '', '', '07:30', 'Confirmed'),
    ('JB-260928-001', 'abc-travel', 'ABC Travel India', '', 'James Bond', '2026-09-28', 'Not Included', 'Included', 4, 0, 0, 0, 'Liam Wright', 'Karon', 'Movenpick Resort', '', '', '08:00', 'Confirmed'),
    ('PP-261003-001', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-10-03', 'Included', null, 11, 3, 1, 1, 'Sophie Bennett', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
    ('JB-261005-001', 'mumbai-holidays', 'Mumbai Holidays', '', 'James Bond', '2026-10-05', 'Included', 'Included', 6, 1, 0, 0, 'Ravi Desai', 'Kata', 'Sawasdee Village', '', '', '07:45', 'Confirmed'),
    ('PP-261012-001', 'delhi-travel', 'Delhi Travel Group', '', 'PP', '2026-10-12', 'Not Included', null, 7, 2, 0, 1, 'Ishaan Gupta', 'Karon', 'Centara Karon', '', '', '08:00', 'Confirmed'),
    ('JB-261018-001', 'golden-triangle', 'Golden Triangle Travel', '', 'James Bond', '2026-10-18', 'Included', 'Not Included', 5, 0, 0, 0, 'Elena Rossi', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
    ('PP-261025-001', 'abc-travel', 'ABC Travel India', '', 'PP', '2026-10-25', 'Included', null, 8, 1, 1, 0, 'Hannah Cole', 'Other', 'The Nai Harn', '', '', 'Pending Confirmation', 'Pending Pickup Time'),
    ('PP-261102-001', 'mumbai-holidays', 'Mumbai Holidays', '', 'PP', '2026-11-02', 'Included', null, 10, 4, 0, 1, 'Aisha Khan', 'Patong', 'Baan Yin Dee', '', '', '07:30', 'Confirmed'),
    ('JB-261108-001', 'delhi-travel', 'Delhi Travel Group', '', 'James Bond', '2026-11-08', 'Included', 'Included', 4, 2, 0, 0, 'Rohan Mehta', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
    ('PP-261115-001', 'golden-triangle', 'Golden Triangle Travel', '', 'PP', '2026-11-15', 'Not Included', null, 6, 0, 0, 1, 'Claire Dubois', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
    ('JB-261122-001', 'abc-travel', 'ABC Travel India', '', 'James Bond', '2026-11-22', 'Included', 'Included', 8, 3, 1, 0, 'Tom Hughes', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed')
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
    'seeded_booking_codes', 63
  );
end;
$$;

revoke all on function public.seed_mock_data() from public;
grant execute on function public.seed_mock_data() to anon, authenticated, service_role;

-- Run seed immediately
select public.seed_mock_data();
