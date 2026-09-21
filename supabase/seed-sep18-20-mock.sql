-- Rich mock boards for 18–19 Sept 2026 (transfer + No Transfer).
-- Run in Supabase SQL Editor. Safe to re-run (deletes then re-inserts these dates).
-- Does NOT seed 20 Sept or later — use real bookings from that date onward.

delete from public.boat_assignments
where booking_code in (
  select code from public.bookings
  where date in ('2026-09-18', '2026-09-19')
);

delete from public.van_assignments
where booking_code in (
  select code from public.bookings
  where date in ('2026-09-18', '2026-09-19')
);

delete from public.bookings
where date in ('2026-09-18', '2026-09-19');

insert into public.bookings (
  code, agent_slug, agent_name, agent_ref, program, date,
  park_fee, canoe, adults, children, infants, tour_leaders,
  lead_guest, pickup_zone, pickup_hotel, room_number, note,
  pickup_time, status
) values
  -- ── 18 Sept PP ──
  ('PP2609-0181', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1264', 'PP', '2026-09-18', 'Included', null, 2, 1, 0, 0, 'Rahul Mehta', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
  ('PP2609-0182', 'delhi-travel', 'Delhi Travel Group', 'DT-1265', 'PP', '2026-09-18', 'Included', null, 2, 0, 0, 0, 'Ananya Sharma', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
  ('PP2609-0183', 'abc-travel', 'ABC Travel India', 'ABC-1266', 'PP', '2026-09-18', 'Included', null, 1, 0, 0, 0, 'Wei Lin', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
  ('PP2609-0184', 'golden-triangle', 'Golden Triangle Travel', 'GT-1267', 'PP', '2026-09-18', 'Included', null, 2, 0, 0, 0, 'Carla Mendes', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
  ('PP2609-0185', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1268', 'PP', '2026-09-18', 'Not Included', null, 2, 0, 1, 0, 'Jon Park', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
  ('PP2609-0186', 'abc-travel', 'ABC Travel India', 'ABC-1269', 'PP', '2026-09-18', 'Included', null, 3, 0, 0, 0, 'Self Drive Party', 'No Transfer', '', '', 'Own car — meet at pier', 'No transfer', 'Confirmed'),
  ('PP2609-0187', 'delhi-travel', 'Delhi Travel Group', 'DT-1270', 'PP', '2026-09-18', 'Included', null, 2, 0, 0, 0, 'Hotel Guest Walk-in', 'No Transfer', '', '', '', 'No transfer', 'Confirmed'),
  ('PP2609-0188', 'golden-triangle', 'Golden Triangle Travel', 'GT-1271', 'PP', '2026-09-18', 'Included', null, 1, 1, 0, 0, 'Priya Desai', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
  ('PP2609-0189', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1272', 'PP', '2026-09-18', 'Included', null, 2, 0, 0, 0, 'Tom Bradley', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
  ('PP2609-0190', 'abc-travel', 'ABC Travel India', 'ABC-1273', 'PP', '2026-09-18', 'Included', null, 1, 0, 0, 0, 'Yuki Mori', 'Other', 'The Nai Harn', '', '', 'Awaiting pickup time', 'Pending Pickup Time'),
  ('PP2609-0191', 'delhi-travel', 'Delhi Travel Group', 'DT-1274', 'PP', '2026-09-18', 'Included', null, 2, 0, 0, 0, 'Sara Ali', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
  ('PP2609-0192', 'golden-triangle', 'Golden Triangle Travel', 'GT-1275', 'PP', '2026-09-18', 'Not Included', null, 4, 0, 0, 0, 'Group Boat Meet', 'No Transfer', '', '', 'Already at pier 08:00', 'No transfer', 'Confirmed'),
  -- ── 18 Sept JB ──
  ('JB2609-0181', 'golden-triangle', 'Golden Triangle Travel', 'GT-1276', 'James Bond', '2026-09-18', 'Included', 'Included', 2, 0, 0, 0, 'Michael Tan', 'Kata', 'The Shore Residences', '', '', '07:45', 'Confirmed'),
  ('JB2609-0182', 'abc-travel', 'ABC Travel India', 'ABC-1277', 'James Bond', '2026-09-18', 'Included', 'Included', 2, 1, 0, 0, 'Elena Rossi', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
  ('JB2609-0183', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1278', 'James Bond', '2026-09-18', 'Included', 'Not Included', 2, 0, 0, 0, 'No Transfer Duo', 'No Transfer', '', '', 'Taxi themselves', 'No transfer', 'Confirmed'),
  ('JB2609-0184', 'delhi-travel', 'Delhi Travel Group', 'DT-1279', 'James Bond', '2026-09-18', 'Included', 'Included', 1, 0, 0, 0, 'Hans Mueller', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
  ('JB2609-0185', 'abc-travel', 'ABC Travel India', 'ABC-1280', 'James Bond', '2026-09-18', 'Included', 'Included', 2, 0, 0, 0, 'Amy Chen', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
  ('JB2609-0186', 'golden-triangle', 'Golden Triangle Travel', 'GT-1281', 'James Bond', '2026-09-18', 'Included', 'Included', 3, 0, 0, 1, 'Pier Meetup', 'No Transfer', '', '', '', 'No transfer', 'Confirmed'),
  ('JB2609-0187', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1282', 'James Bond', '2026-09-18', 'Included', 'Not Included', 2, 0, 0, 0, 'Raj Kapoor', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
  ('JB2609-0188', 'delhi-travel', 'Delhi Travel Group', 'DT-1283', 'James Bond', '2026-09-18', 'Included', 'Included', 1, 0, 0, 0, 'Lisa Brown', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
  -- ── 19 Sept PP ──
  ('PP2609-0193', 'abc-travel', 'ABC Travel India', 'ABC-1284', 'PP', '2026-09-19', 'Included', null, 2, 0, 0, 0, 'David Chen', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
  ('PP2609-0194', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1285', 'PP', '2026-09-19', 'Included', null, 2, 2, 0, 0, 'Nina Patel', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
  ('PP2609-0195', 'golden-triangle', 'Golden Triangle Travel', 'GT-1286', 'PP', '2026-09-19', 'Included', null, 2, 0, 0, 0, 'Self Arrange A', 'No Transfer', '', '', 'Friend picking up', 'No transfer', 'Confirmed'),
  ('PP2609-0196', 'delhi-travel', 'Delhi Travel Group', 'DT-1287', 'PP', '2026-09-19', 'Not Included', null, 1, 0, 0, 0, 'Omar Farid', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
  ('PP2609-0197', 'abc-travel', 'ABC Travel India', 'ABC-1288', 'PP', '2026-09-19', 'Included', null, 2, 0, 0, 0, 'Grace Lee', 'Patong', 'Novotel Phuket', '', '', '07:30', 'Confirmed'),
  ('PP2609-0198', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1289', 'PP', '2026-09-19', 'Included', null, 2, 0, 0, 0, 'Bruno Silva', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
  ('PP2609-0199', 'delhi-travel', 'Delhi Travel Group', 'DT-1290', 'PP', '2026-09-19', 'Included', null, 1, 1, 0, 0, 'Self Arrange B', 'No Transfer', '', '', '', 'No transfer', 'Confirmed'),
  ('PP2609-0200', 'golden-triangle', 'Golden Triangle Travel', 'GT-1291', 'PP', '2026-09-19', 'Included', null, 2, 0, 0, 0, 'Hana Suzuki', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed'),
  ('PP2609-0201', 'abc-travel', 'ABC Travel India', 'ABC-1292', 'PP', '2026-09-19', 'Included', null, 2, 0, 1, 0, 'Paul Wright', 'Patong', 'Impiana Patong', '', '', '07:30', 'Confirmed'),
  ('PP2609-0202', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1293', 'PP', '2026-09-19', 'Included', null, 1, 0, 0, 0, 'Mei Wong', 'Other', 'Laguna Phuket', '', '', 'Awaiting pickup time', 'Pending Pickup Time'),
  ('PP2609-0203', 'delhi-travel', 'Delhi Travel Group', 'DT-1294', 'PP', '2026-09-19', 'Not Included', null, 2, 0, 0, 0, 'Ibrahim Hassan', 'Kata', 'Kata Palm Resort', '', '', '07:45', 'Confirmed'),
  ('PP2609-0204', 'golden-triangle', 'Golden Triangle Travel', 'GT-1295', 'PP', '2026-09-19', 'Included', null, 3, 1, 0, 0, 'Walk-in Family', 'No Transfer', '', '', '', 'No transfer', 'Confirmed'),
  -- ── 19 Sept JB ──
  ('JB2609-0189', 'abc-travel', 'ABC Travel India', 'ABC-1296', 'James Bond', '2026-09-19', 'Included', 'Included', 2, 0, 0, 0, 'Sophie Bennett', 'Patong', 'Holiday Inn Resort', '', '', '07:30', 'Confirmed'),
  ('JB2609-0190', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1297', 'James Bond', '2026-09-19', 'Included', 'Included', 2, 0, 0, 0, 'Ravi Desai', 'Kata', 'Sawasdee Village', '', '', '07:45', 'Confirmed'),
  ('JB2609-0191', 'golden-triangle', 'Golden Triangle Travel', 'GT-1298', 'James Bond', '2026-09-19', 'Included', 'Included', 2, 0, 0, 0, 'No Van Needed', 'No Transfer', '', '', '', 'No transfer', 'Confirmed'),
  ('JB2609-0192', 'delhi-travel', 'Delhi Travel Group', 'DT-1299', 'James Bond', '2026-09-19', 'Included', 'Not Included', 1, 1, 0, 0, 'Clara Jung', 'Karon', 'Centara Grand', '', '', '08:00', 'Confirmed'),
  ('JB2609-0193', 'abc-travel', 'ABC Travel India', 'ABC-1300', 'James Bond', '2026-09-19', 'Included', 'Included', 2, 0, 0, 0, 'Alex Kim', 'Patong', 'ABC Hotel', '', '', '07:30', 'Confirmed'),
  ('JB2609-0194', 'mumbai-holidays', 'Mumbai Holidays', 'MH-1301', 'James Bond', '2026-09-19', 'Included', 'Included', 4, 0, 0, 0, 'Pier Only', 'No Transfer', '', '', 'Join boat directly', 'No transfer', 'Confirmed'),
  ('JB2609-0195', 'golden-triangle', 'Golden Triangle Travel', 'GT-1302', 'James Bond', '2026-09-19', 'Included', 'Included', 2, 0, 0, 0, 'Nadia Costa', 'Kata', 'Boathouse', '', '', '07:45', 'Confirmed'),
  ('JB2609-0196', 'delhi-travel', 'Delhi Travel Group', 'DT-1303', 'James Bond', '2026-09-19', 'Included', 'Not Included', 1, 0, 0, 0, 'Ethan Brooks', 'Karon', 'Beyond Resort Karon', '', '', '08:00', 'Confirmed');
