-- Original booked guest counts.
-- Marina check-in / Guest pick up (no-show, own arrival) lower the LIVE counts on the booking
-- (adults, children, infants, tour_leaders) so the daily board and check-in stay accurate.
-- These columns keep the numbers as originally booked so the Booking page and the Google Sheets
-- backup do not shrink. NULL on all four = the booking was never reduced by ops (original = live).
-- Safe to re-run.

alter table public.bookings add column if not exists original_adults integer;
alter table public.bookings add column if not exists original_children integer;
alter table public.bookings add column if not exists original_infants integer;
alter table public.bookings add column if not exists original_tour_leaders integer;

-- One-off backfill from the booking_events audit log for ops reductions that happened before this
-- column existed. Only bookings whose live pax are all adults are filled (the removed guests were
-- adults), using the total before the first ops reduction.
with first_reduction as (
  select distinct on (e.booking_code)
    e.booking_code,
    (regexp_match(e.summary, 'pax ([0-9]+)→([0-9]+)'))[1]::int as before_total
  from public.booking_events e
  where e.event_type = 'details_edited'
    and e.actor_name in ('Guest pick up', 'Marina check-in')
    and e.summary ~ 'pax [0-9]+→[0-9]+'
  order by e.booking_code, e.created_at asc
)
update public.bookings b
set original_adults = f.before_total,
    original_children = 0,
    original_infants = 0,
    original_tour_leaders = 0
from first_reduction f
where b.code = f.booking_code
  and b.original_adults is null
  and b.children = 0 and b.infants = 0 and b.tour_leaders = 0
  and f.before_total > b.adults;
