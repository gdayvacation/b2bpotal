-- Day a lot starts receiving bookings. Null means this lot does not take bookings yet.
-- Safe to re-run.

alter table public.agent_allotments
  add column if not exists usage_from date;

comment on column public.agent_allotments.usage_from is
  'Bookings from this date belong to this lot until the next lot usage_from. Null keeps the previous lot receiving bookings.';
