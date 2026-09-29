-- Sticky flag: booking had a late date change (after late_fee_from_time Thailand).
-- Invoice agents → Change date line at full tour price.
-- Prebuy agents → Change date line deducts heads like no-show (amount 0).
-- Safe to re-run.

alter table public.bookings
  add column if not exists late_date_change boolean not null default false;
