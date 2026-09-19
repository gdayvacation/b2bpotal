-- Booking change history (cancel, date change, rebook, edits, pickup time).
-- Run once in Supabase SQL Editor.

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null references public.bookings (code) on update cascade on delete cascade,
  event_type text not null
    check (event_type in (
      'created',
      'cancelled',
      'date_changed',
      'rebooked',
      'pickup_set',
      'details_edited'
    )),
  summary text not null default '',
  actor_role text not null check (actor_role in ('admin', 'agent')),
  actor_name text not null default '',
  actor_slug text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_events_booking_code_idx
  on public.booking_events (booking_code, created_at desc);

alter table public.booking_events enable row level security;

drop policy if exists pilot_booking_events_all on public.booking_events;
create policy pilot_booking_events_all on public.booking_events
  for all using (true) with check (true);
