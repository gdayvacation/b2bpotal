-- Clear ALL booking + ops data on or before 22 September 2026 (real and mock).
-- Keeps 23 September 2026 onward unchanged.
-- Run once in Supabase SQL Editor.
--
-- Removes:
--   check-in rows, bookings (cascades boat/van assignments + booking_events),
--   day boat / vehicle plans + van meta, booking closures, availability

-- Preview (optional):
-- select date, count(*) from public.bookings
-- where date <= '2026-09-22'
-- group by date
-- order by date;

delete from public.check_in_services where date <= '2026-09-22';
delete from public.check_in_enrollments where date <= '2026-09-22';
delete from public.check_in_attendance where date <= '2026-09-22';
delete from public.check_in_payments where date <= '2026-09-22';

delete from public.bookings where date <= '2026-09-22';

delete from public.boat_assignments where date <= '2026-09-22';
delete from public.van_assignments where date <= '2026-09-22';
delete from public.van_meta where date <= '2026-09-22';
delete from public.day_boat_plans where date <= '2026-09-22';
delete from public.day_vehicle_plans where date <= '2026-09-22';
delete from public.booking_closures where date <= '2026-09-22';
delete from public.availability where date <= '2026-09-22';
