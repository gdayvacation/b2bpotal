-- Booking closures: admin can close booking for a date + program (storm, boat out, etc.).
-- Run once in Supabase SQL Editor.

create table if not exists public.booking_closures (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  reason text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program)
);

drop trigger if exists booking_closures_set_updated_at on public.booking_closures;
create trigger booking_closures_set_updated_at
before update on public.booking_closures
for each row execute function public.set_updated_at();

alter table public.booking_closures enable row level security;

drop policy if exists pilot_booking_closures_all on public.booking_closures;
create policy pilot_booking_closures_all on public.booking_closures
  for all to anon, authenticated using (true) with check (true);
