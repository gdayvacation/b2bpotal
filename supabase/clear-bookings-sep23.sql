-- Clear ALL booking + ops data for 23 September 2026.
-- Run once in Supabase SQL Editor (or via the helper script).
--
-- Removes:
--   bookings (cascades boat_assignments, van_assignments, booking_events)
--   marina check-in rows for that date
--   day boat / vehicle plans + van meta for that date

-- Preview (optional — run SELECT first if you want a count):
-- select code, program, agent_name, lead_guest, status
-- from public.bookings
-- where date = '2026-09-23'
-- order by program, code;

delete from public.check_in_services where date = '2026-09-23';
delete from public.check_in_enrollments where date = '2026-09-23';
delete from public.check_in_attendance where date = '2026-09-23';
delete from public.check_in_payments where date = '2026-09-23';

delete from public.bookings where date = '2026-09-23';

-- Orphans / day plans left behind after booking delete
delete from public.boat_assignments where date = '2026-09-23';
delete from public.van_assignments where date = '2026-09-23';
delete from public.van_meta where date = '2026-09-23';
delete from public.day_boat_plans where date = '2026-09-23';
delete from public.day_vehicle_plans where date = '2026-09-23';
