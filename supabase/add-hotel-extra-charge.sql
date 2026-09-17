-- =============================================================================
-- Extra Charge Transfer notes for Other-zone hotels (+ booking snapshot)
-- Run once in Supabase SQL Editor if hotels/bookings already exist.
-- =============================================================================

alter table public.hotels
  add column if not exists extra_charge_transfer text not null default '';

alter table public.bookings
  add column if not exists transfer_extra_charge text not null default '';
