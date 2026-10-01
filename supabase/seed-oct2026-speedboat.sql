-- October'26 Goodday Speedboat.xlsx → PP + James Bond
-- 162 rows (137 PP, 25 JB), 2026-10-02–2026-10-31.
-- Safe to re-run: replaces bookings only on 2026-10-02–2026-10-31 (keeps 1 Oct manual entries when skipped).
-- "Jame bond" blocks go to program = James Bond.
-- Park-fee-only COT is stored as park_fee = Not Included, not duplicated in cash_on_tour.
-- Notes left blank (portal is live).

insert into public.agents (slug, name, country, status) values
  ('booking-window', 'Booking Window', '', 'Active'),
  ('888', '888', '', 'Active'),
  ('star-edge', 'Star Edge', '', 'Active'),
  ('smile-leisure', 'Smile Leisure', '', 'Active'),
  ('dj', 'DJ', '', 'Active')
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
where date between '2026-10-02' and '2026-10-31';
delete from public.check_in_enrollments
where date between '2026-10-02' and '2026-10-31';
delete from public.check_in_attendance
where date between '2026-10-02' and '2026-10-31';
delete from public.check_in_payments
where date between '2026-10-02' and '2026-10-31';
delete from public.check_in_guest_edits
where date between '2026-10-02' and '2026-10-31';
delete from public.check_in_sequences
where date between '2026-10-02' and '2026-10-31';

delete from public.boat_assignments
where booking_code in (
  select code from public.bookings
  where date between '2026-10-02' and '2026-10-31'
);
delete from public.van_assignments
where booking_code in (
  select code from public.bookings
  where date between '2026-10-02' and '2026-10-31'
);

delete from public.bookings
where date between '2026-10-02' and '2026-10-31';

insert into public.bookings (
  code, agent_slug, agent_name, agent_ref, program, date,
  park_fee, canoe, adults, children, infants, tour_leaders,
  lead_guest, pickup_zone, pickup_hotel, room_number, note,
  cash_on_tour, transfer_extra_charge,
  private_transfer_vehicle, private_transfer_price,
  private_driver_name, private_driver_phone,
  pickup_time, status, late_change_fee
) values
  ('PP2610-0028', 'booking-window', 'Booking Window', 'MMTTH000020', 'PP', '2026-10-02', 'Not Included', null, 4, 0, 0, 0, 'MR. Ganesh Shankarrao Shrimanwar', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0029', 'booking-window', 'Booking Window', 'MTHTH000008', 'PP', '2026-10-02', 'Not Included', null, 2, 0, 0, 0, 'Gaurav Jaiswal', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0030', 'booking-window', 'Booking Window', 'BWTH1265195/FI6IT1OIGT', 'PP', '2026-10-02', 'Not Included', null, 2, 0, 0, 0, 'Anjana Mannotti', 'Kamala', 'Thavorn Beach Village Resort & Spa', '', '', '', 'Extra Charge 100/pax', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0031', 'booking-window', 'Booking Window', 'BWTH1265359/UULV8NUCGT', 'PP', '2026-10-02', 'Not Included', null, 12, 0, 0, 0, 'MADHOOLIKA JHA', 'Patong', 'BAAN HEAVEN PHUKET', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0032', 'booking-window', 'Booking Window', 'BWTH1257738', 'PP', '2026-10-02', 'Not Included', null, 2, 1, 0, 0, 'Mr. Kaxil Himanshubhai Patel', 'Private', '', '', '', '', '', 'Van', '1,600 THB', '', '', 'Reach 09:30', 'Confirmed', 0),
  ('PP2610-0033', '888', '888', '17531', 'PP', '2026-10-02', 'Included', null, 15, 5, 0, 0, 'MR. SAJAN KUMAR KHANDELWAL', 'Patong', 'Novotel Phuket Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0034', 'star-edge', 'Star Edge', '4503815', 'PP', '2026-10-02', 'Not Included', null, 7, 0, 0, 0, 'Mr. Hemanth Kumar Narayana', 'Patong', 'Fishermen''s Harbour Urban Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0001', 'booking-window', 'Booking Window', 'MTHTH829614', 'James Bond', '2026-10-02', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Manya Gupta', 'Patong', 'Sunset Beach Resort Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0035', 'booking-window', 'Booking Window', 'BWTH1263008', 'PP', '2026-10-03', 'Not Included', null, 2, 0, 0, 0, 'Mr. Ujjawal Singhal', 'Private', '', '', '', '', '', 'Van', '1,600 THB', '', '', 'Reach 09:30', 'Confirmed', 0),
  ('PP2610-0036', 'booking-window', 'Booking Window', 'MTHTH000049', 'PP', '2026-10-03', 'Not Included', null, 2, 0, 0, 0, 'Kalp Atulbhai Shah', 'Patong', 'Sunset Beach Resort Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0037', 'booking-window', 'Booking Window', 'MTHTH829640', 'PP', '2026-10-03', 'Not Included', null, 4, 0, 0, 0, 'Pankaj Mehra', 'Kata', 'The Yama Hotel', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0038', 'booking-window', 'Booking Window', 'MTHTH829658', 'PP', '2026-10-03', 'Not Included', null, 4, 0, 0, 0, 'Siju Thaikkadan Thomas', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0039', 'booking-window', 'Booking Window', 'MTHTH829884', 'PP', '2026-10-03', 'Not Included', null, 2, 0, 0, 0, 'Bhumi Sirodariya', 'Patong', 'Andakira Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0040', 'star-edge', 'Star Edge', '4495255', 'PP', '2026-10-03', 'Included', null, 2, 0, 0, 0, 'Mr. Umesh Chander Sharma', 'Private', 'Holiday Inn Resort', '', '', '', '', 'Van', '1,600 THB', '', '', 'Reach 09:30', 'Confirmed', 0),
  ('JB2610-0002', 'booking-window', 'Booking Window', 'BWTH1257738', 'James Bond', '2026-10-03', 'Not Included', 'Not Included', 2, 1, 0, 0, 'Mr. Kaxil Himanshubhai Patel', 'Private', '', '', '', '', '', 'Van', '1,600 THB', '', '', 'Reach 09:30', 'Confirmed', 0),
  ('PP2610-0041', 'booking-window', 'Booking Window', 'MMTTH000031', 'PP', '2026-10-04', 'Not Included', null, 2, 0, 0, 0, 'Mr.Ganesh Tukaram Yerme', 'Patong', 'Andakira Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0042', 'booking-window', 'Booking Window', 'MTHTH829648', 'PP', '2026-10-04', 'Not Included', null, 2, 0, 0, 0, 'Vishal Rajoria', 'Patong', 'The Aim Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0043', 'booking-window', 'Booking Window', 'MTHTH829722', 'PP', '2026-10-04', 'Not Included', null, 2, 0, 0, 0, 'Kunal Sarda', 'Patong', 'Phuket Graceland Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0044', 'booking-window', 'Booking Window', 'MTHTH829868', 'PP', '2026-10-04', 'Not Included', null, 2, 0, 0, 0, 'Ankit Mahendra Jain', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0045', 'booking-window', 'Booking Window', '4485169', 'PP', '2026-10-04', 'Not Included', null, 4, 1, 0, 0, 'Mr. Pankaj Nagpal', 'Patong', 'Amari Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0046', 'star-edge', 'Star Edge', '4465268', 'PP', '2026-10-04', 'Included', null, 9, 1, 0, 0, 'Mr. Ramesh Kumar', 'Kalim', 'OCEANFRONT BEACH RESORT', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2610-0047', 'booking-window', 'Booking Window', 'MMTTH000022', 'PP', '2026-10-05', 'Not Included', null, 2, 0, 0, 0, 'Mr Samir Anand', 'Patong', 'Andaman Beach Suites Hote', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0048', 'booking-window', 'Booking Window', 'MMTTH000063', 'PP', '2026-10-05', 'Not Included', null, 2, 0, 0, 0, 'Ritu Ramsay', 'Patong', 'Amari Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0049', 'booking-window', 'Booking Window', 'MTHTH829724', 'PP', '2026-10-05', 'Not Included', null, 8, 0, 1, 0, 'Sanket Vilas Karekar', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0050', 'booking-window', 'Booking Window', 'MTHTH829864', 'PP', '2026-10-05', 'Not Included', null, 6, 0, 0, 0, 'BHEEMSEN BHEEMSEN', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0051', 'booking-window', 'Booking Window', 'BWTH1266516/FMT2ANE7GT', 'PP', '2026-10-05', 'Not Included', null, 2, 0, 0, 0, 'Bikash Senapati', 'Patong', 'The Brown boutique @Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0003', 'booking-window', 'Booking Window', 'MTHTH829729', 'James Bond', '2026-10-05', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Surendra Chunnilal Jain', 'Karon', 'Woraburi Phuket Resort & Spa', '', '', '', '', '', '', '', '', '07:20', 'Confirmed', 0),
  ('PP2610-0052', 'booking-window', 'Booking Window', 'MTHTH000021', 'PP', '2026-10-06', 'Not Included', null, 2, 0, 0, 0, 'Pranav Ranjan', 'Patong', 'Deevana Plaza Phuket Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0053', 'booking-window', 'Booking Window', 'MTHTH000023', 'PP', '2026-10-06', 'Not Included', null, 2, 0, 0, 0, 'Siddharth Shankar', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0054', 'booking-window', 'Booking Window', 'MTHTH829830', 'PP', '2026-10-06', 'Not Included', null, 3, 0, 0, 0, 'Ruchi Chopra', 'Kata', 'Novotel Phuket Kata Avista', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0055', 'booking-window', 'Booking Window', 'MTHTH829854', 'PP', '2026-10-06', 'Not Included', null, 2, 0, 0, 0, 'Anushikha Mahendra Pokhriyal', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0056', 'booking-window', 'Booking Window', 'MTHTH829876', 'PP', '2026-10-06', 'Not Included', null, 2, 0, 0, 0, 'Shivam Shivam', 'Patong', '77 Patong Beach Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0057', 'booking-window', 'Booking Window', 'MTHTH829896', 'PP', '2026-10-06', 'Not Included', null, 2, 0, 0, 0, 'Anshul Singh', 'Patong', 'Casa Del M Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0004', 'booking-window', 'Booking Window', 'MTHTH829724', 'James Bond', '2026-10-06', 'Not Included', 'Not Included', 8, 0, 1, 0, 'Sanket Vilas Karekar', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '07:40', 'Confirmed', 0),
  ('PP2610-0058', 'booking-window', 'Booking Window', 'MTHTH829824', 'PP', '2026-10-07', 'Not Included', null, 2, 1, 1, 0, 'Rahul Majumder', 'Kata', 'Chanalai Garden Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0059', 'booking-window', 'Booking Window', 'MTHTH829890', 'PP', '2026-10-07', 'Not Included', null, 4, 0, 0, 0, 'Kirti Pardhan', 'Kata', 'Andaman Cannacia Resort & Spa', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('JB2610-0005', 'booking-window', 'Booking Window', 'MTHTH829898', 'James Bond', '2026-10-07', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Dipti Nair', 'Patong', 'THE LUNAR PATONG', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0060', 'booking-window', 'Booking Window', 'MTHTH829772', 'PP', '2026-10-08', 'Not Included', null, 2, 0, 0, 0, 'Amandeep Singh', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0061', 'booking-window', 'Booking Window', 'MTHTH829907', 'PP', '2026-10-08', 'Not Included', null, 2, 0, 0, 0, 'Ananya Arvind', 'Kata', 'Avista Hideaway Phuket Patong', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0062', 'booking-window', 'Booking Window', 'BWTH1266210/1TTRKPWSGT', 'PP', '2026-10-08', 'Not Included', null, 2, 0, 0, 0, 'Dhanesh Kalekar', 'Patong', 'The Taksim Bangla Beach Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0063', 'smile-leisure', 'Smile Leisure', '', 'PP', '2026-10-08', 'Included', null, 3, 0, 0, 0, 'MR. VEERANDER SHUNSHETTY', 'Kalim', 'ANDAMANTRA RESORT AND VILLA', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('JB2610-0006', 'booking-window', 'Booking Window', 'MTHTH829781', 'James Bond', '2026-10-08', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Ronak Bharda', 'Patong', 'Mercure Phuket Patong Journey Hub', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0064', 'booking-window', 'Booking Window', 'BWTH1256088', 'PP', '2026-10-09', 'Not Included', null, 2, 0, 0, 0, 'Ms. Shivangi Gupta', 'Patong', 'Coconut Village Resort Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0065', 'booking-window', 'Booking Window', 'MTHTH000053', 'PP', '2026-10-09', 'Not Included', null, 2, 0, 0, 0, 'Shivam Kohli', 'Patong', 'Citrus Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0066', 'booking-window', 'Booking Window', 'MTHTH829648', 'PP', '2026-10-09', 'Not Included', null, 2, 0, 0, 0, 'Vishal Rajoria', 'Patong', 'The Aim Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0067', 'booking-window', 'Booking Window', 'MTHTH829687', 'PP', '2026-10-09', 'Not Included', null, 2, 0, 0, 0, 'Atheeq Ul Rehman Shaik', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0068', 'booking-window', 'Booking Window', 'MTHTH829905', 'PP', '2026-10-09', 'Not Included', null, 3, 0, 0, 0, 'Kothandaraman Rajendran Parambakkam', 'Patong', 'Andaman Beach Suites Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0007', 'booking-window', 'Booking Window', 'MMTTH000049', 'James Bond', '2026-10-09', 'Not Included', 'Not Included', 2, 1, 0, 0, 'MR. DEEPAK GUPTA', 'Patong', 'Citrus Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0008', 'booking-window', 'Booking Window', 'MTHTH829717', 'James Bond', '2026-10-09', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Sanjeev Kumar', 'Patong', 'ANDAMAN EMBRACE PATONG', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0009', 'booking-window', 'Booking Window', 'MTHTH829907', 'James Bond', '2026-10-09', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Ananya Arvind', 'Patong', 'Avista Hideaway Phuket Patong - MGallery', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0069', 'booking-window', 'Booking Window', 'MMTTH000049', 'PP', '2026-10-10', 'Not Included', null, 2, 1, 0, 0, 'MR. DEEPAK GUPTA', 'Patong', 'Citrus Patong Hotel by Compass Hospitality', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0070', 'booking-window', 'Booking Window', 'MTHTH000019', 'PP', '2026-10-10', 'Not Included', null, 2, 0, 0, 0, 'Mitesh Potnis', 'Patong', 'Ramada By Wyndham Phuket Deevana', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0071', 'booking-window', 'Booking Window', 'MTHTH829759', 'PP', '2026-10-10', 'Not Included', null, 2, 0, 0, 0, 'TBA', 'Kalim', 'Zenmaya Oceanfront Phuket', '', '', '', '', '', '', '', '', '07:40', 'Confirmed', 0),
  ('PP2610-0072', 'booking-window', 'Booking Window', 'MTHTH829853', 'PP', '2026-10-10', 'Not Included', null, 2, 0, 0, 0, 'Vadluri Nikhil Sai', 'Patong', '77 Patong Beach Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0073', 'dj', 'DJ', 'FIT01325', 'PP', '2026-10-10', 'Included', null, 2, 0, 0, 0, 'MR SHRIVATHSA BHAT NAGARAJ BHAT', 'Patong', 'OCEANFRONT FRONT BEACH RESORT', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0074', 'booking-window', 'Booking Window', 'MTHTH829929', 'PP', '2026-10-10', 'Not Included', null, 2, 0, 0, 0, 'Indeevar Chadha', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0075', 'booking-window', 'Booking Window', 'MTHTH829938', 'PP', '2026-10-10', 'Not Included', null, 2, 1, 0, 0, 'Sandeep Kumar', 'Patong', 'Patong Lodge Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0076', 'booking-window', 'Booking Window', 'MTHTH000018', 'PP', '2026-10-11', 'Not Included', null, 2, 0, 0, 0, 'Jayesh Lekhraj Bachani', 'Patong', 'Mercure Phuket Patong Journey hub', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0077', 'booking-window', 'Booking Window', 'MTHTH000043', 'PP', '2026-10-11', 'Not Included', null, 2, 1, 0, 0, 'Abbas Mirza', 'Patong', 'Andaman Beach Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0078', 'booking-window', 'Booking Window', 'MTHTH829748', 'PP', '2026-10-11', 'Not Included', null, 5, 0, 0, 0, 'Merianda Uthappa Chengappa', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0079', 'booking-window', 'Booking Window', 'MTHTH829768', 'PP', '2026-10-11', 'Not Included', null, 6, 0, 0, 0, 'Arya Arya', 'Patong', 'Bel Aire Patong Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0080', 'booking-window', 'Booking Window', 'MTHTH829802', 'PP', '2026-10-11', 'Not Included', null, 2, 0, 1, 0, 'Jitendra Pal Singh', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0081', 'booking-window', 'Booking Window', 'MTHTH829865', 'PP', '2026-10-11', 'Not Included', null, 2, 0, 0, 0, 'Bhavesh Mohan Pisat', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0082', 'booking-window', 'Booking Window', 'MTHTH829921', 'PP', '2026-10-11', 'Not Included', null, 2, 0, 0, 0, 'Nishit Jain', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0083', 'booking-window', 'Booking Window', 'MTHTH829988', 'PP', '2026-10-11', 'Not Included', null, 2, 0, 0, 0, 'Shivam Sharma', 'Kata', 'Peach Blossom Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('JB2610-0010', 'booking-window', 'Booking Window', 'MTHTH000019', 'James Bond', '2026-10-11', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Mitesh Potnis', 'Patong', 'Ramada By Wyndham', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0011', 'booking-window', 'Booking Window', 'MTHTH000053', 'James Bond', '2026-10-11', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Shivam Kohli', 'Patong', 'Citrus Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0084', 'booking-window', 'Booking Window', 'MMTTH000081', 'PP', '2026-10-12', 'Not Included', null, 3, 0, 0, 0, 'Mr. Nikhil Rajkumar Modi', 'Patong', 'Andakira Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0085', 'booking-window', 'Booking Window', 'MTHTH829624', 'PP', '2026-10-12', 'Not Included', null, 3, 0, 0, 0, 'Amita Arora', 'Patong', 'Amari Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0086', 'booking-window', 'Booking Window', 'MTHTH829626', 'PP', '2026-10-12', 'Not Included', null, 4, 0, 0, 0, 'Tishya Banerjee', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0087', 'booking-window', 'Booking Window', 'MTHTH829654', 'PP', '2026-10-12', 'Not Included', null, 2, 0, 0, 0, 'Pranav Hudev Arun Kumar', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0088', 'booking-window', 'Booking Window', 'MTHTH829657', 'PP', '2026-10-12', 'Not Included', null, 2, 0, 0, 0, 'Pavan Kumar Nanjundappa', 'Patong', 'Ashlee Plaza Patong Hotel & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0089', 'booking-window', 'Booking Window', 'MTHTH829911', 'PP', '2026-10-12', 'Not Included', null, 3, 0, 0, 0, 'Narinder Bir Kaur', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0090', 'booking-window', 'Booking Window', 'BWTH1266700/NSXFYHZHGT', 'PP', '2026-10-12', 'Not Included', null, 3, 0, 0, 0, 'PRANAY KISHORE MISHRA', 'Patong', 'Fishermen''s Harbour Urban Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0091', 'booking-window', 'Booking Window', 'MTHTH000045', 'PP', '2026-10-13', 'Not Included', null, 2, 1, 0, 0, 'Avik Das', 'Patong', 'Andakira Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0092', 'booking-window', 'Booking Window', 'MTHTH829621', 'PP', '2026-10-13', 'Not Included', null, 2, 0, 0, 0, 'Mohammed Tokir Manva', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0093', 'booking-window', 'Booking Window', 'MTHTH829628', 'PP', '2026-10-13', 'Not Included', null, 2, 1, 0, 0, 'Sundeep V K', 'Patong', 'Patong bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0094', 'booking-window', 'Booking Window', 'MTHTH829732', 'PP', '2026-10-13', 'Not Included', null, 2, 0, 0, 0, 'Narayansamy Selvaraj', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0095', 'booking-window', 'Booking Window', 'MTHTH829862', 'PP', '2026-10-13', 'Included', null, 2, 0, 0, 0, 'Aashish Bhatia', 'Patong', 'Zenseana Resort & Spa', '', '', '800 THB', '', '', '', '', '', '08:00', 'Cancelled', 0),
  ('JB2610-0012', 'booking-window', 'Booking Window', 'MTHTH829706', 'James Bond', '2026-10-13', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Ramya Sree Venu Gopal Rajeshwari', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '07:40', 'Confirmed', 0);

insert into public.bookings (
  code, agent_slug, agent_name, agent_ref, program, date,
  park_fee, canoe, adults, children, infants, tour_leaders,
  lead_guest, pickup_zone, pickup_hotel, room_number, note,
  cash_on_tour, transfer_extra_charge,
  private_transfer_vehicle, private_transfer_price,
  private_driver_name, private_driver_phone,
  pickup_time, status, late_change_fee
) values
  ('PP2610-0096', 'booking-window', 'Booking Window', 'MTHTH829843', 'PP', '2026-10-14', 'Not Included', null, 3, 1, 0, 0, 'Abhishek Pandey', 'Patong', 'Diamond Cliff Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0097', 'booking-window', 'Booking Window', 'MTHTH829866', 'PP', '2026-10-14', 'Not Included', null, 2, 0, 0, 0, 'Sourav Chatterjee', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0013', 'booking-window', 'Booking Window', 'MTHTH829621', 'James Bond', '2026-10-14', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Mohammed Tokir Manva', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0014', 'booking-window', 'Booking Window', 'MTHTH829732', 'James Bond', '2026-10-14', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Narayansamy Selvaraj', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0098', 'booking-window', 'Booking Window', 'MTHTH829661', 'PP', '2026-10-15', 'Not Included', null, 7, 0, 0, 0, 'Radha Govindaraju', 'Patong', 'Citrus Patong Hotel By Compass Hospitality', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0099', 'booking-window', 'Booking Window', 'MTHTH829795', 'PP', '2026-10-15', 'Not Included', null, 2, 0, 0, 0, 'Nagaraja Bhanu Prakash', 'Patong', 'Patong Lodge Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0100', 'booking-window', 'Booking Window', 'MTHTH829815', 'PP', '2026-10-15', 'Not Included', null, 6, 1, 0, 0, 'Prabhavathi Logesh', 'Kata', 'each Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0101', 'booking-window', 'Booking Window', 'MTHTH829838', 'PP', '2026-10-15', 'Not Included', null, 2, 0, 0, 0, 'Sreedevi Varakavi', 'Patong', 'Sun Sea Sand Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0102', 'booking-window', 'Booking Window', 'MTHTH829897', 'PP', '2026-10-15', 'Not Included', null, 4, 0, 0, 0, 'Rajvi Gajendra Chaudhary', 'Patong', 'The Nature Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0103', 'booking-window', 'Booking Window', 'BWTH1265049/EGJYGOWTGT', 'PP', '2026-10-15', 'Included', null, 2, 0, 0, 0, 'Pooja Lona', 'Patong', '77 Patong hotel & spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0104', 'booking-window', 'Booking Window', 'BWTH1263969', 'PP', '2026-10-15', 'Not Included', null, 2, 0, 0, 0, 'Mr. Rajkumar Gautam', 'Patong', 'Bel Aire Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0105', 'booking-window', 'Booking Window', 'MTHTH000048', 'PP', '2026-10-17', 'Not Included', null, 2, 0, 0, 0, 'Neha Sharma', 'Karon', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0106', 'booking-window', 'Booking Window', 'MTHTH829695', 'PP', '2026-10-17', 'Not Included', null, 2, 1, 0, 0, 'Neha Sharma', 'Karon', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0107', 'booking-window', 'Booking Window', 'MTHTH829825', 'PP', '2026-10-17', 'Not Included', null, 2, 0, 0, 0, 'Keerthi Manikyanahali Chandrashekar', 'Patong', 'atong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0108', 'booking-window', 'Booking Window', 'MTHTH829840', 'PP', '2026-10-17', 'Not Included', null, 3, 0, 0, 0, 'Gaurav Gururaj', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0109', 'booking-window', 'Booking Window', 'MTHTH829920', 'PP', '2026-10-17', 'Not Included', null, 4, 0, 0, 0, 'Mandeep Singh', 'Kamala', 'Radisson Resort & Suites Phuket', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0110', 'booking-window', 'Booking Window', 'MTHTH829992', 'PP', '2026-10-17', 'Not Included', null, 2, 0, 0, 0, 'Pradip Arun Ghayal', 'Patong', '77 Patong Beach Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0111', 'booking-window', 'Booking Window', 'MMTTH000042', 'PP', '2026-10-18', 'Not Included', null, 4, 0, 0, 0, 'MR. Samydurai Subramani', 'Patong', 'Patong Lodge Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0112', 'booking-window', 'Booking Window', 'MTHTH829790', 'PP', '2026-10-18', 'Not Included', null, 2, 0, 0, 0, 'KARTHIGA RAMASUBRAMANIAN', 'Patong', 'Patong Lodge Hotel TTM', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0113', 'booking-window', 'Booking Window', 'MTHTH829810', 'PP', '2026-10-18', 'Not Included', null, 4, 2, 0, 0, 'Deepika Saxena', 'Patong', 'atong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0114', 'booking-window', 'Booking Window', 'MTHTH829844', 'PP', '2026-10-18', 'Not Included', null, 2, 0, 0, 0, 'Anjana Srinivasa Moorthy', 'Patong', 'Citrus Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0015', 'booking-window', 'Booking Window', 'MTHTH829939', 'James Bond', '2026-10-18', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Arindam Mallick', 'Patong', 'Ramada by Wyndham Phuket Deevana Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0115', 'booking-window', 'Booking Window', 'MTHTH000020', 'PP', '2026-10-19', 'Not Included', null, 4, 0, 0, 0, 'Ponkhi Mojinder Barua', 'Patong', 'Citrus Patong Hotel by Compass Hospitality', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0116', 'booking-window', 'Booking Window', 'MTHTH829623', 'PP', '2026-10-19', 'Not Included', null, 2, 0, 1, 0, 'Debangshu Ghosh', 'Patong', 'M Social Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0117', 'booking-window', 'Booking Window', 'MTHTH829760', 'PP', '2026-10-19', 'Not Included', null, 2, 0, 0, 0, 'Veerayya Hawaldar', 'Karon', 'Diamond Cliff', '', '', '', '', '', '', '', '', '07:40', 'Confirmed', 0),
  ('PP2610-0118', 'booking-window', 'Booking Window', 'MTHTH829780', 'PP', '2026-10-19', 'Not Included', null, 5, 0, 0, 0, 'Robin Bhuyan', 'Patong', 'Amata Patong Holidays', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0119', 'booking-window', 'Booking Window', 'MTHTH829922', 'PP', '2026-10-19', 'Not Included', null, 4, 0, 0, 0, 'Harpreet Singh', 'Kalim', 'Diamond Cliff Resort & Spa Phuket', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('JB2610-0016', 'booking-window', 'Booking Window', 'MTHTH829960', 'James Bond', '2026-10-19', 'Not Included', 'Not Included', 3, 0, 0, 0, 'Shilpa Prakashrao Bhambore', 'Patong', 'Andakira Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0120', 'booking-window', 'Booking Window', 'MTHTH829620', 'PP', '2026-10-20', 'Not Included', null, 3, 0, 0, 0, 'Deepak Kumar Agal', 'Patong', 'Sunset Beach Resort Phuket Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0121', 'booking-window', 'Booking Window', 'MTHTH829668', 'PP', '2026-10-20', 'Not Included', null, 2, 0, 0, 0, 'Amit Kumar', 'Patong', 'Triple L Hotel Patong Beach Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0122', 'booking-window', 'Booking Window', 'MTHTH829913', 'PP', '2026-10-20', 'Not Included', null, 4, 0, 0, 0, 'Gireesan Katholil', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0123', 'booking-window', 'Booking Window', 'MTHTH829766', 'PP', '2026-10-21', 'Not Included', null, 2, 0, 0, 0, 'Ishita Tudu', 'Patong', 'Patong Lodge Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0124', 'booking-window', 'Booking Window', 'MTHTH829817', 'PP', '2026-10-21', 'Not Included', null, 7, 0, 0, 0, 'Sandhya Shivarama Reddy', 'Patong', 'Amari Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0125', 'booking-window', 'Booking Window', 'MTHTH829944', 'PP', '2026-10-21', 'Not Included', null, 2, 0, 0, 0, 'Kumara Venkatahanumaiah', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0126', 'booking-window', 'Booking Window', 'MTHTH829945', 'PP', '2026-10-21', 'Not Included', null, 8, 0, 0, 0, 'Pardeep Singh', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0127', 'booking-window', 'Booking Window', 'MTHTH829969', 'PP', '2026-10-21', 'Not Included', null, 2, 0, 0, 0, 'SURESH KUMAR KRISHNAPPA', 'Patong', 'Elite Suites Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0017', 'booking-window', 'Booking Window', 'MMTTH000055', 'James Bond', '2026-10-21', 'Not Included', 'Not Included', 4, 2, 0, 0, 'Mr. Rupan Panja', 'Private', 'Patong Lodge Hotel', '', '', '', '', 'Van', '1,600 THB', '', '', 'Reach 09:30', 'Confirmed', 0),
  ('PP2610-0128', 'star-edge', 'Star Edge', '4166730', 'PP', '2026-10-22', 'Not Included', null, 9, 3, 0, 0, 'Mr. Abinash Kumar Behera', 'Patong', 'Best Western Patong Beach Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0129', 'booking-window', 'Booking Window', 'MMTTH000066', 'PP', '2026-10-22', 'Not Included', null, 3, 0, 0, 0, 'Nidhin Alex John', 'Patong', 'Diamond Cliff Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0130', 'booking-window', 'Booking Window', 'MTHTH829619', 'PP', '2026-10-22', 'Not Included', null, 4, 0, 0, 0, 'Sachin Surendrakumar Shah', 'Patong', 'ASHLEE Heights Patong Hotel & Suites', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0131', 'booking-window', 'Booking Window', 'MTHTH829727', 'PP', '2026-10-22', 'Not Included', null, 3, 0, 0, 0, 'Sanjeev Mukherjee', 'Kata', 'Peach Blossom Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0132', 'booking-window', 'Booking Window', 'MTHTH829788', 'PP', '2026-10-22', 'Not Included', null, 3, 1, 0, 0, 'Kavitha Malur Nagendra Murthy', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0133', 'booking-window', 'Booking Window', 'MTHTH829962', 'PP', '2026-10-22', 'Not Included', null, 4, 0, 0, 0, 'athakkathulla Kani Mohamed Abdul Kader', 'Patong', 'Fishermen''S Harbour', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0018', 'booking-window', 'Booking Window', 'MTHTH829944', 'James Bond', '2026-10-22', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Kumara Venkatahanumaiah', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0134', 'booking-window', 'Booking Window', 'MTHTH829739', 'PP', '2026-10-23', 'Not Included', null, 2, 0, 0, 0, 'umith Kumar Lnu', 'Patong', 'Patong Lodge Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0135', 'booking-window', 'Booking Window', 'MTHTH829751', 'PP', '2026-10-24', 'Not Included', null, 2, 2, 0, 0, 'Sahadeva Sattiganahalli Krishnegowda', 'Patong', 'Andakira Hotel Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0136', 'booking-window', 'Booking Window', 'MTHTH829782', 'PP', '2026-10-24', 'Not Included', null, 3, 1, 0, 0, 'Smruti Milan Tripathy', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0137', 'booking-window', 'Booking Window', 'MTHTH829874', 'PP', '2026-10-24', 'Not Included', null, 2, 0, 0, 0, 'Pavan Srivastava', 'Patong', 'Patong Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0019', 'booking-window', 'Booking Window', 'MTHTH829739', 'James Bond', '2026-10-24', 'Not Included', 'Not Included', 2, 0, 0, 0, 'Sumith Kumar Lnu', 'Patong', 'Patong Lodge Hotel', '', '', '', '', '', '', '', '', '07:40', 'Confirmed', 0),
  ('PP2610-0138', 'booking-window', 'Booking Window', 'BWTH1258150/D7GKS6N2GT', 'PP', '2026-10-25', 'Not Included', null, 2, 0, 0, 0, 'Nikita Kademani', 'Patong', 'Ibis Phuket Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0139', 'booking-window', 'Booking Window', 'MMTTH000024', 'PP', '2026-10-25', 'Not Included', null, 8, 0, 0, 0, 'Mr Sakshi Subodh Thite', 'Karon', 'Chanalai Hillside Resort Karon Beach', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0140', 'booking-window', 'Booking Window', 'MTHTH829857', 'PP', '2026-10-25', 'Not Included', null, 3, 0, 0, 0, 'Debabrata Debbarma', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0141', 'booking-window', 'Booking Window', 'MTHTH829870', 'PP', '2026-10-25', 'Not Included', null, 2, 1, 0, 0, 'Yugandhar Singh Kshatriya', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0142', 'star-edge', 'Star Edge', '4475394', 'PP', '2026-10-25', 'Not Included', null, 4, 0, 0, 0, 'Mr. Bhupinder Singh', 'Patong', 'Patong Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0143', 'booking-window', 'Booking Window', 'BWTH1265760/YIR4ZEIIGT', 'PP', '2026-10-25', 'Included', null, 5, 1, 0, 0, 'Mr. Khina Maya Sharma', 'Patong', 'Phuket Graceland Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0144', 'booking-window', 'Booking Window', 'MTHTH829971', 'PP', '2026-10-25', 'Not Included', null, 2, 0, 0, 0, 'Abhishek Shrivastava', 'Kalim', 'Kalim Resort', '', '', '', '', '', '', '', '', '07:50', 'Confirmed', 0),
  ('PP2610-0145', 'booking-window', 'Booking Window', 'MMTTH000058', 'PP', '2026-10-26', 'Not Included', null, 2, 0, 0, 0, 'Suneel Saxena', 'Patong', 'The Nature Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0146', 'booking-window', 'Booking Window', 'MMTTH000076', 'PP', '2026-10-26', 'Not Included', null, 2, 0, 0, 0, 'Mr. Sharanya Jagadeesh', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0147', 'booking-window', 'Booking Window', 'MTHIN000001', 'PP', '2026-10-26', 'Not Included', null, 2, 0, 0, 0, 'Vivek Somasundaran Nair', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0148', 'booking-window', 'Booking Window', 'MTHTH829900', 'PP', '2026-10-26', 'Not Included', null, 4, 0, 0, 0, 'Vishal Bommisetty', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0020', 'booking-window', 'Booking Window', 'MTHTH829692', 'James Bond', '2026-10-26', 'Not Included', 'Not Included', 4, 0, 0, 0, 'Ernest John Shanmugam', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '07:40', 'Confirmed', 0),
  ('PP2610-0149', 'booking-window', 'Booking Window', 'MTHTH000006', 'PP', '2026-10-27', 'Not Included', null, 2, 0, 0, 0, 'Jaykumar Harshadkumar Pandya', 'Private', '', '', '', '', '', 'Van', '1,600 THB', '', '', 'Reach 09:30', 'Confirmed', 0),
  ('PP2610-0150', 'booking-window', 'Booking Window', 'MTHTH829735', 'PP', '2026-10-27', 'Not Included', null, 2, 1, 0, 0, 'Arnab Shome', 'Patong', 'Four Points by Sheraton', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0151', 'booking-window', 'Booking Window', 'MTHTH829880', 'PP', '2026-10-27', 'Not Included', null, 2, 0, 0, 0, 'Pranshu Kaushik', 'Patong', 'Zenseana Resort & Spa', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0021', 'booking-window', 'Booking Window', 'MTHTH829734', 'James Bond', '2026-10-27', 'Not Included', 'Not Included', 6, 0, 0, 0, 'Shivraj Dhairyasheel Patil', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('JB2610-0022', 'booking-window', 'Booking Window', 'MTHTH829892', 'James Bond', '2026-10-27', 'Not Included', 'Not Included', 4, 0, 0, 0, 'Avisek Roy', 'Patong', 'Nipa Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0152', 'booking-window', 'Booking Window', 'MTHTH829734', 'PP', '2026-10-28', 'Not Included', null, 6, 0, 0, 0, 'Shivraj Dhairyasheel Patil', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('JB2610-0023', 'booking-window', 'Booking Window', 'MTHTH000013', 'James Bond', '2026-10-28', 'Not Included', 'Not Included', 4, 0, 0, 0, 'qbal Avalkar', 'Patong', 'Ashlee Hub Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0024', 'booking-window', 'Booking Window', 'MTHTH829744', 'James Bond', '2026-10-28', 'Not Included', 'Not Included', 3, 0, 0, 0, 'Nikhil Rupchand Ninave', 'Patong', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:20', 'Confirmed', 0),
  ('PP2610-0153', 'booking-window', 'Booking Window', 'MMTTH000039', 'PP', '2026-10-29', 'Not Included', null, 2, 0, 0, 0, 'Mr Dinesh Kumar Sethi', 'Patong', 'Mercure Phuket Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0154', 'booking-window', 'Booking Window', 'MTHTH829703', 'PP', '2026-10-29', 'Not Included', null, 4, 0, 0, 0, 'Sibasankar Sahu', 'Patong', 'The AIM Patong Hotel', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0155', 'booking-window', 'Booking Window', 'MTHTH829723', 'PP', '2026-10-29', 'Not Included', null, 2, 0, 0, 0, 'Kalsank Chandrakanth Beena', 'Patong', 'THE LUNAR PATONG Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0156', 'booking-window', 'Booking Window', 'MTHTH829784', 'PP', '2026-10-29', 'Not Included', null, 2, 0, 0, 0, 'Shamith Kumar Lnu', 'Kata', 'Peach Hill Hotel & Resort', '', '', '', '', '', '', '', '', '07:30', 'Confirmed', 0),
  ('PP2610-0157', 'booking-window', 'Booking Window', 'MTHTH829872', 'PP', '2026-10-29', 'Not Included', null, 2, 0, 0, 0, 'MAYANK SHARMA', 'Patong', 'Patong Resort', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0158', 'booking-window', 'Booking Window', 'MTHTH829742', 'PP', '2026-10-30', 'Not Included', null, 4, 0, 0, 0, 'Neeraj Diwan', 'Patong', 'Hotel Clover Patong Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0159', 'booking-window', 'Booking Window', 'MTHTH829746', 'PP', '2026-10-30', 'Not Included', null, 2, 0, 0, 0, 'Simranjeet Singh Bedi', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0160', 'booking-window', 'Booking Window', 'MTHTH829953', 'PP', '2026-10-30', 'Not Included', null, 2, 0, 1, 0, 'Soumen Chowdhury', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0161', 'booking-window', 'Booking Window', 'MTHTH829955', 'PP', '2026-10-30', 'Not Included', null, 3, 0, 0, 0, 'Aditya Suresh Kasar', 'Patong', 'Elite Suite Hotel Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('JB2610-0025', 'booking-window', 'Booking Window', 'MTHTH829818', 'James Bond', '2026-10-30', 'Not Included', 'Not Included', 3, 0, 0, 0, 'Nirupam Sen', 'Patong', 'ANDAMAN EMBRACE PATONG', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0162', 'booking-window', 'Booking Window', 'MTHTH829650', 'PP', '2026-10-31', 'Not Included', null, 2, 0, 0, 0, 'SHUBHAM BUDAKOTI', 'Patong', 'Patong Bay Residence', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0);

insert into public.bookings (
  code, agent_slug, agent_name, agent_ref, program, date,
  park_fee, canoe, adults, children, infants, tour_leaders,
  lead_guest, pickup_zone, pickup_hotel, room_number, note,
  cash_on_tour, transfer_extra_charge,
  private_transfer_vehicle, private_transfer_price,
  private_driver_name, private_driver_phone,
  pickup_time, status, late_change_fee
) values
  ('PP2610-0163', 'booking-window', 'Booking Window', 'MTHTH829958', 'PP', '2026-10-31', 'Not Included', null, 2, 0, 0, 0, 'Prachi Tushar Ahir', 'Patong', 'Double tree By Hilton Phuket', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0),
  ('PP2610-0164', 'booking-window', 'Booking Window', 'BWTH1266701/ZBFDXHO5GT', 'PP', '2026-10-31', 'Included', null, 5, 0, 0, 0, 'Pitam Kumar Mukhopadhyay', 'Patong', 'Comfort Home Patong', '', '', '', '', '', '', '', '', '08:00', 'Confirmed', 0);

select date, program, count(*) as bookings,
  sum(adults) as adl, sum(children) as chd, sum(infants) as inf, sum(tour_leaders) as foc
from public.bookings
where date between '2026-10-02' and '2026-10-31'
group by date, program
order by date, program;
