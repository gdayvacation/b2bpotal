-- Date moves from marina check-in.
-- moved_out_*   : guests moved OFF this booking to another date (cumulative). The booking keeps its
--                 original booked counts (original_*), live counts drop to the guests who stay, and
--                 the invoice bills original - live - moved_out as no-show.
-- moved_from_*  : this booking holds guests moved IN from another date/booking (shown as a
--                 "moved from" badge; the extra change-date charge is stored in late_change_fee).
-- Safe to re-run.

alter table public.bookings add column if not exists moved_out_adults integer;
alter table public.bookings add column if not exists moved_out_children integer;
alter table public.bookings add column if not exists moved_out_infants integer;
alter table public.bookings add column if not exists moved_out_tour_leaders integer;
alter table public.bookings add column if not exists moved_from_code text;
alter table public.bookings add column if not exists moved_from_date date;
