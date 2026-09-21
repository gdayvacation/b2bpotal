-- Private transfer (admin-only billing to agent).
-- Run once in Supabase SQL Editor.
-- Car = 1,400 THB · Van = 1,600 THB (stored as text on the booking).

alter table public.bookings
  add column if not exists private_transfer_vehicle text not null default '',
  add column if not exists private_transfer_price text not null default '',
  add column if not exists private_driver_name text not null default '',
  add column if not exists private_driver_phone text not null default '';

alter table public.bookings
  drop constraint if exists bookings_private_transfer_vehicle_check;

alter table public.bookings
  add constraint bookings_private_transfer_vehicle_check
  check (private_transfer_vehicle in ('', 'Car', 'Van'));
