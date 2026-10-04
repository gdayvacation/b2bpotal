-- Prebuy no-show date move: remember that staff changed the date after a no-show
-- so the invoice can deduct the original heads and add the per-person fee.

alter table public.bookings
  add column if not exists no_show_date_move boolean not null default false;

comment on column public.bookings.no_show_date_move is
  'Staff moved this booking after a no-show. Prebuy bills the original-date head deduct plus the date-change fee on the same invoice.';
