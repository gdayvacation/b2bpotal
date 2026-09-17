-- Allow bookings.status = 'Cancelled' (frees seats / boat / van capacity).
-- Run once in Supabase SQL Editor if bookings already exist.

alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (status in ('Confirmed', 'Pending Pickup Time', 'Cancelled'));
