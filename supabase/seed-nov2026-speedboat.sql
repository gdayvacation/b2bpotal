-- November'26 Goodday Speedboat.xlsx → PP + James Bond
-- 82 rows (63 PP, 19 JB), 2026-11-01–2026-11-30.
-- Safe to re-run: replaces bookings only on 2026-11-01–2026-11-30 (keeps 1 Nov when --skip-nov1).
-- "Jame bond" blocks go to program = James Bond.
-- Park-fee-only COT is stored as park_fee = Not Included, not duplicated in cash_on_tour.
-- Notes left blank (portal is live).

insert into public.agents (slug, name, country, status) values
  ('booking-window', 'Booking Window', '', 'Active')
on conflict (slug) do update set
  name = excluded.name,
  status = excluded.status;

insert into public.pickup_zones (name, time, pending, sort_order) values
  ('Patong', '07:30', false, 10),
  ('Kata', '07:45', false, 20),
  ('Karon', '08:00', false, 30),
  ('Kamala', '07:45', false, 40),
  ('Kalim', '07:50', false, 50),
  ('Tritrang', '07:45', false, 60),
  ('Town', '08:50', false, 70),
  ('สิเหร่', '08:00', false, 80),
  ('Khao Keaw', '07:30', false, 90),
  ('Private', 'Reach 09:30', false, 95),
  ('No Transfer', 'No transfer', false, 96),
  ('Other', 'Awaiting pickup time', true, 999)
on conflict (name) do update set
  time = excluded.time,
  pending = excluded.pending,
  sort_order = excluded.sort_order;

delete from public.check_in_services
where date between '2026-11-01' and '2026-11-30';
delete from public.check_in_enrollments
where date between '2026-11-01' and '2026-11-30';
delete from public.check_in_attendance
where date between '2026-11-01' and '2026-11-30';
delete from public.check_in_payments
where date between '2026-11-01' and '2026-11-30';
delete from public.check_in_guest_edits
where date between '2026-11-01' and '2026-11-30';
delete from public.check_in_sequences
where date between '2026-11-01' and '2026-11-30';

delete from public.boat_assignments
where booking_code in (
  select code from public.bookings
  where date between '2026-11-01' and '2026-11-30'
);
delete from public.van_assignments
where booking_code in (
  select code from public.bookings
  where date between '2026-11-01' and '2026-11-30'
);

delete from public.bookings
where date between '2026-11-01' and '2026-11-30';

insert into public.bookings (
  code, agent_slug, agent_name, agent_ref, program, date,
  park_fee, canoe, adults, children, infants, tour_leaders,
  lead_guest, pickup_zone, pickup_hotel, room_number, note,
  cash_on_tour, transfer_extra_charge,
  private_transfer_vehicle, private_transfer_price,
  private_driver_name, private_driver_phone,
  pickup_time, status, late_change_fee
) values
  ('PP2611-0028', 'booking-window', 'Booking Window', 'MTHTH829707', 'PP', '2026-11-01', 'Not Included', null, 2, 0, 0, 0, 'Anurag Kumar', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0029', 'booking-window', 'Booking Window', 'MTHTH829919', 'PP', '2026-11-01', 'Not Included', null, 2, 0, 1, 0, 'Hari Prasad Kotegar', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0030', 'booking-window', 'Booking Window', 'MTHTH000022', 'PP', '2026-11-02', 'Not Included', null, 2, 1, 0, 0, 'Shanu Sinha', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0031', 'booking-window', 'Booking Window', 'MTHTH829682', 'PP', '2026-11-02', 'Not Included', null, 3, 0, 0, 0, 'Piyali Mandal', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0032', 'booking-window', 'Booking Window', 'MTHTH829937', 'PP', '2026-11-02', 'Not Included', null, 2, 0, 0, 0, 'Rupali Rout', 'Patong', 'Bel Aire Patong Resort Holidays', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0033', 'booking-window', 'Booking Window', 'MTHTH000029', 'PP', '2026-11-03', 'Not Included', null, 4, 0, 0, 0, 'Dhimant Vishnuprasad Dave', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0034', 'booking-window', 'Booking Window', 'MTHTH829745', 'PP', '2026-11-03', 'Not Included', null, 2, 2, 0, 0, 'Nikhil Trimbak Bhadake', 'Patong', 'Sunset Beach Resort Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0001', 'booking-window', 'Booking Window', 'MTHTH000022', 'James Bond', '2026-11-03', 'Not Included', 'Not Included', 2, 1, 0, 0, 'Shanu Sinha', 'Patong', 'Ramada By Wyndham', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0002', 'booking-window', 'Booking Window', 'MTHTH829682', 'James Bond', '2026-11-03', 'Not Included', 'Not Included', 3, 0, 0, 0, 'Piyali Mandal', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0035', 'booking-window', 'Booking Window', 'MTHTH829666', 'PP', '2026-11-04', 'Not Included', null, 4, 1, 0, 0, 'GAURAV KISHORBHAI VEKARIYA', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0036', 'booking-window', 'Booking Window', 'MTHTH829686', 'PP', '2026-11-04', 'Not Included', null, 2, 1, 0, 0, 'Mohammad Nazim Mohammad Sharif Shaikh', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0037', 'booking-window', 'Booking Window', 'MTHTH829996', 'PP', '2026-11-04', 'Not Included', null, 2, 0, 0, 0, 'Nisha Rai', 'Karon', 'Chanalai Garden Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('JB2611-0003', 'booking-window', 'Booking Window', 'MTHTH000029', 'James Bond', '2026-11-04', 'Not Included', 'Not Included', 4, 0, 0, 0, 'Dhimant Vishnuprasad Dave', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0038', 'booking-window', 'Booking Window', 'MTHTH829711', 'PP', '2026-11-05', 'Not Included', null, 4, 0, 0, 0, 'Mandeep Nayyar', 'Patong', 'The ASHLEE Heights', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0004', 'booking-window', 'Booking Window', 'MTHTH000030', 'James Bond', '2026-11-05', 'Not Included', 'Not Included', 2, 1, 0, 0, 'Manindra Bhushan', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0039', 'booking-window', 'Booking Window', 'MMTTH000065', 'PP', '2026-11-06', 'Not Included', null, 4, 0, 0, 0, 'Jaspreet Singh Fnu', 'Patong', 'Ashlee Plaza Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0005', 'booking-window', 'Booking Window', 'MTHTH000032', 'James Bond', '2026-11-06', 'Not Included', 'Not Included', 3, 0, 0, 0, 'Satish Sarvotham Nayak', 'Patong', 'Andakira Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0006', 'booking-window', 'Booking Window', 'MTHTH829850', 'James Bond', '2026-11-06', 'Not Included', 'Not Included', 4, 1, 0, 0, 'GAURAV KISHORBHAI VEKARIYA', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0040', 'booking-window', 'Booking Window', 'MTHTH829625', 'PP', '2026-11-07', 'Not Included', null, 4, 0, 0, 0, 'Abhishek Tiwary', 'Patong', 'Ramada By Wyndham', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0041', 'booking-window', 'Booking Window', 'MTHTH829878', 'PP', '2026-11-07', 'Not Included', null, 2, 0, 0, 0, 'Goutam Deka', 'Patong', 'Bel Aire Patong Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0042', 'booking-window', 'Booking Window', 'MTHTH829924', 'PP', '2026-11-07', 'Not Included', null, 5, 1, 0, 0, 'Vineeta Soni', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0007', 'booking-window', 'Booking Window', 'MMTTH000065', 'James Bond', '2026-11-07', 'Not Included', 'Not Included', 4, 0, 0, 0, 'Jaspreet Singh Fnu', 'Patong', 'Ashlee Plaza Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0008', 'booking-window', 'Booking Window', 'MTHTH829949', 'James Bond', '2026-11-07', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Nischita T V', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0043', 'booking-window', 'Booking Window', 'MTHTH829885', 'PP', '2026-11-08', 'Not Included', null, 3, 0, 0, 0, 'Sowmya Seshadri Neelanahalli', 'Patong', 'Patong Lodge Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0009', 'booking-window', 'Booking Window', 'MTHTH829625', 'James Bond', '2026-11-08', 'Not Included', 'Not Included', 4, 0, 0, 0, 'Abhishek Tiwary', 'Patong', 'Ramada By Wyndham', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0044', 'booking-window', 'Booking Window', 'MMTTH000009', 'PP', '2026-11-09', 'Not Included', null, 3, 0, 0, 0, 'SHAHNAWAZ MOHAMMED ANSARI', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0045', 'booking-window', 'Booking Window', 'MTHTH829755', 'PP', '2026-11-09', 'Not Included', null, 2, 0, 0, 0, 'Saikat Halder', 'Patong', 'Bel Aire Patong Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0046', 'booking-window', 'Booking Window', 'MTHTH829997', 'PP', '2026-11-09', 'Not Included', null, 2, 2, 0, 0, 'Jibran Qureshi', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0047', 'booking-window', 'Booking Window', 'MTHTH829882', 'PP', '2026-11-10', 'Not Included', null, 3, 0, 0, 0, 'Hoshang Nalinaksha Solanki', 'Patong', 'Ramada by Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0048', 'booking-window', 'Booking Window', 'MMTTH000086', 'PP', '2026-11-11', 'Not Included', null, 5, 4, 0, 0, 'Mr. Manoj Dash/Chintamani Dash', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0010', 'booking-window', 'Booking Window', 'MTHTH829882', 'James Bond', '2026-11-11', 'Not Included', 'Not Included', 3, 0, 0, 0, 'Hoshang Nalinaksha Solanki', 'Patong', 'Ramada by Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0049', 'booking-window', 'Booking Window', 'MTHTH829691', 'PP', '2026-11-12', 'Not Included', null, 2, 0, 0, 0, 'Varun Sridar', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0050', 'booking-window', 'Booking Window', 'MTHTH829804', 'PP', '2026-11-12', 'Not Included', null, 4, 1, 0, 0, 'Sandeep Ganpatrao Mane', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0051', 'booking-window', 'Booking Window', 'MTHTH829877', 'PP', '2026-11-12', 'Not Included', null, 3, 1, 0, 0, 'Sudhir Tatwani', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0052', 'booking-window', 'Booking Window', 'MTHTH829948', 'PP', '2026-11-12', 'Not Included', null, 6, 0, 0, 0, 'Mayuresh Amalkant Varerkar', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0053', 'booking-window', 'Booking Window', 'MTHTH829975', 'PP', '2026-11-12', 'Not Included', null, 3, 0, 0, 0, 'Govind Mishrilal Bang', 'Kalim', 'Patong Lodge Hotel Phuket', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2611-0054', 'booking-window', 'Booking Window', 'MTHTH829986', 'PP', '2026-11-12', 'Not Included', null, 2, 0, 0, 0, 'Avinash Kumar', 'Kalim', 'Zenmaya Oceanfront Phuket', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2611-0055', 'booking-window', 'Booking Window', 'MMTTH000026', 'PP', '2026-11-13', 'Not Included', null, 2, 0, 0, 0, 'Rahul Shashikant Sabnis', 'Patong', 'Ramada By Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0056', 'booking-window', 'Booking Window', 'MTHTH000033', 'PP', '2026-11-13', 'Not Included', null, 3, 0, 0, 0, 'Samir Mohan Kolte', 'Patong', 'Ramada By Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0057', 'booking-window', 'Booking Window', 'MTHTH000035', 'PP', '2026-11-13', 'Not Included', null, 4, 1, 0, 0, 'Priyanka Kunal Pardule/Sivaraman Vishwanathan Asari', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0058', 'booking-window', 'Booking Window', 'MTHTH000037', 'PP', '2026-11-13', 'Not Included', null, 2, 1, 0, 0, 'Sagar Shree Deolalkar', 'Patong', 'Ramada By Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0059', 'booking-window', 'Booking Window', 'MTHTH829990', 'PP', '2026-11-13', 'Not Included', null, 3, 0, 0, 0, 'Mamta Joshi', 'Patong', 'Grace Patong Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0011', 'booking-window', 'Booking Window', 'MTHTH829691', 'James Bond', '2026-11-13', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Varun Sridar', 'Patong', 'Zenseana Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0012', 'booking-window', 'Booking Window', 'MTHTH829804', 'James Bond', '2026-11-13', 'Not Included', 'Not Included', 4, 1, 0, 0, 'Sandeep Ganpatrao Mane', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0060', 'booking-window', 'Booking Window', 'MTHTH829665', 'PP', '2026-11-14', 'Not Included', null, 2, 0, 0, 0, 'Kenjal Mehta', 'Kalim', 'Sunset Beach Resort Phuket', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2611-0061', 'booking-window', 'Booking Window', 'MTHTH829757', 'PP', '2026-11-14', 'Not Included', null, 6, 0, 0, 0, 'TUSHAR ARVIND GODAMBE', 'Patong', 'Ramada by Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0062', 'booking-window', 'Booking Window', 'MTHTH829982', 'PP', '2026-11-14', 'Not Included', null, 2, 1, 0, 0, 'Anil Kumar Yadav', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0063', 'booking-window', 'Booking Window', 'MTHTH829983', 'PP', '2026-11-14', 'Not Included', null, 2, 0, 0, 0, 'Kushal Moitra', 'Patong', 'The ASHLEE Heights', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0013', 'booking-window', 'Booking Window', 'MTHTH829948', 'James Bond', '2026-11-14', 'Not Included', 'Not Included', 6, 1, 0, 0, 'Mayuresh Amalkant Varerkar', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0064', 'booking-window', 'Booking Window', 'BWTH1250891', 'PP', '2026-11-15', 'Included', null, 4, 0, 0, 0, 'Mr. Ishish Indoria', 'Patong', 'Mercure Phuket Patong Journeyhub', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0065', 'booking-window', 'Booking Window', 'MTHTH829747', 'PP', '2026-11-15', 'Not Included', null, 4, 0, 0, 0, 'Sushilkumar Anandilal Mandot', 'Patong', 'Andakira Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0066', 'booking-window', 'Booking Window', 'MTHTH829801', 'PP', '2026-11-15', 'Not Included', null, 2, 0, 0, 0, 'Harivanshi Bapu Narayana Murthy', 'Patong', 'Patong Bay Hill Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0067', 'booking-window', 'Booking Window', 'MTHTH829923', 'PP', '2026-11-15', 'Not Included', null, 5, 0, 0, 0, 'Kodandaramaswamy Sumanth Naag', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0068', 'booking-window', 'Booking Window', 'MMTTH000064', 'PP', '2026-11-16', 'Not Included', null, 2, 1, 0, 0, 'Dhaval Badgujar', 'Patong', 'Ramada By Wyndham Phuket Deevana Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0069', 'booking-window', 'Booking Window', 'MTHTH829904', 'PP', '2026-11-16', 'Not Included', null, 5, 2, 1, 0, 'Akshay Gupta', 'Kalim', 'Sunset Beach Resort Phuket', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2611-0070', 'booking-window', 'Booking Window', 'MTHTH829963', 'PP', '2026-11-16', 'Not Included', null, 2, 0, 0, 0, 'Venkata Ram Praveen Nimmala', 'Patong', 'Fishermen''S Harbour', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0014', 'booking-window', 'Booking Window', 'MMTTH000014', 'James Bond', '2026-11-16', 'Not Included', 'Not Included', 2, 1, 0, 0, 'Mr Vivekkumar Prakashbhai Patel', 'Patong', 'Andaman Cannacia Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0071', 'booking-window', 'Booking Window', 'MTHTH000059', 'PP', '2026-11-17', 'Not Included', null, 3, 0, 0, 0, 'Bhaskar Sengupta', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2611-0072', 'booking-window', 'Booking Window', 'MTHTH829669', 'PP', '2026-11-17', 'Not Included', null, 2, 0, 0, 0, 'Nirmit Singhal', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0073', 'booking-window', 'Booking Window', 'MTHTH829738', 'PP', '2026-11-17', 'Not Included', null, 3, 0, 0, 0, 'Kiran Manjunath', 'Patong', 'Ramada By Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0074', 'booking-window', 'Booking Window', 'MTHTH829749', 'PP', '2026-11-17', 'Not Included', null, 2, 0, 0, 0, 'Shweta Negi', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0015', 'booking-window', 'Booking Window', 'MMTTH000064', 'James Bond', '2026-11-17', 'Not Included', 'Not Included', 2, 1, 0, 0, 'Mr. Dhaval Badgujar', 'Patong', 'Ramada By Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0075', 'booking-window', 'Booking Window', 'MTHTH829613', 'PP', '2026-11-18', 'Not Included', null, 3, 1, 0, 0, 'Chintankumar Sureshchandra Modi', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0076', 'booking-window', 'Booking Window', 'MTHTH829683', 'PP', '2026-11-18', 'Not Included', null, 2, 0, 0, 0, 'Parshant Verma', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0077', 'booking-window', 'Booking Window', 'MTHTH829741', 'PP', '2026-11-18', 'Not Included', null, 2, 0, 0, 0, 'Pankaj Manoharlal Kamma', 'Patong', 'Bel Aire Patong Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0078', 'booking-window', 'Booking Window', 'MTHTH829984', 'PP', '2026-11-18', 'Not Included', null, 3, 0, 0, 0, 'Shubha Suryanarayana', 'Patong', 'Elite Suites Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0016', 'booking-window', 'Booking Window', 'MMTTH000011', 'James Bond', '2026-11-18', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Nitin Gupta', 'Patong', 'Sunset Beach Resort Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0079', 'booking-window', 'Booking Window', 'MTHTH829712', 'PP', '2026-11-19', 'Not Included', null, 2, 0, 1, 0, 'Nishant Kumar Gupta', 'Kalim', 'Andamantra Resort and Villa', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2611-0080', 'booking-window', 'Booking Window', 'MTHTH829806', 'PP', '2026-11-19', 'Not Included', null, 2, 1, 0, 0, 'Prachi Karne', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0081', 'booking-window', 'Booking Window', 'MTHTH829832', 'PP', '2026-11-19', 'Not Included', null, 2, 0, 0, 0, 'Varun Hoigegudde Bhat', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0017', 'booking-window', 'Booking Window', 'MTHTH829738', 'James Bond', '2026-11-19', 'Not Included', 'Not Included', 3, 0, 0, 0, 'Kiran Manjunath', 'Patong', 'Mercure Phuket Patong Journey hub', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0018', 'booking-window', 'Booking Window', 'MTHTH829984', 'James Bond', '2026-11-19', 'Not Included', 'Not Included', 3, 0, 0, 0, 'Shubha Suryanarayana', 'Patong', 'Elite Suites Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0082', 'booking-window', 'Booking Window', 'MMTTH000080', 'PP', '2026-11-20', 'Not Included', null, 2, 0, 0, 0, 'Surya Venkatesh', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0083', 'booking-window', 'Booking Window', 'MTHTH000003', 'PP', '2026-11-20', 'Not Included', null, 2, 0, 0, 0, 'Judith Vijay Rodrigues', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0084', 'booking-window', 'Booking Window', 'MTHTH829670', 'PP', '2026-11-20', 'Not Included', null, 2, 0, 0, 0, 'Antara Biswas', 'Patong', 'Amari Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0085', 'booking-window', 'Booking Window', 'MTHTH829867', 'PP', '2026-11-20', 'Not Included', null, 2, 0, 0, 0, 'Aditya Kumar Singh', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0086', 'booking-window', 'Booking Window', 'MTHTH829947', 'PP', '2026-11-20', 'Not Included', null, 2, 0, 0, 0, 'Mr. PRASHANTH ISHWAR SHETTY', 'Kalim', 'Patong Lodge Hotel Phuket', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2611-0087', 'booking-window', 'Booking Window', 'MMTTH000074', 'PP', '2026-11-21', 'Not Included', null, 6, 0, 0, 0, 'Fnu Uthra Lavanya Ramesh', 'Patong', 'Fishermen''s Harbour Urban Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2611-0088', 'booking-window', 'Booking Window', 'BWTH1255327', 'PP', '2026-11-24', 'Included', null, 2, 0, 0, 0, 'Ms. Tamanna Aggarwal', 'Kalim', 'Sunset Beach Resort', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2611-0089', 'booking-window', 'Booking Window', 'MMTTH000045', 'PP', '2026-11-24', 'Not Included', null, 2, 0, 0, 0, 'MR. Joseph Philip', 'Patong', 'Elite Suites Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0);

insert into public.bookings (
  code, agent_slug, agent_name, agent_ref, program, date,
  park_fee, canoe, adults, children, infants, tour_leaders,
  lead_guest, pickup_zone, pickup_hotel, room_number, note,
  cash_on_tour, transfer_extra_charge,
  private_transfer_vehicle, private_transfer_price,
  private_driver_name, private_driver_phone,
  pickup_time, status, late_change_fee
) values
  ('PP2611-0090', 'booking-window', 'Booking Window', 'MMTTH000068', 'PP', '2026-11-26', 'Not Included', null, 2, 0, 0, 0, 'Sandipan Bhowmik', 'Patong', 'Fishermen''s Harbour Urban Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2611-0019', 'booking-window', 'Booking Window', 'MMTTH000045', 'James Bond', '2026-11-26', 'Not Included', 'Not Included', 2, 0, 0, 0, 'MR. Joseph Philip', 'Patong', 'Elite Suites Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0);

select date, program, count(*) as bookings,
  sum(adults) as adl, sum(children) as chd, sum(infants) as inf, sum(tour_leaders) as foc
from public.bookings
where date between '2026-11-01' and '2026-11-30'
group by date, program
order by date, program;
