-- Late-cancel flag + optional admin cancel amount for Bills.
-- Safe to re-run.

alter table public.bookings
  add column if not exists late_cancel boolean not null default false;

alter table public.bookings
  add column if not exists cancel_fee int null check (cancel_fee is null or cancel_fee >= 0);
