-- Cash collected on tour (optional note/amount on bookings).
-- Run once in Supabase SQL Editor.

alter table public.bookings
  add column if not exists cash_on_tour text not null default '';
