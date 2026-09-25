-- Marina check-in board notes per booking.
-- Run once in Supabase SQL Editor after add-check-in.sql.

create table if not exists public.check_in_notes (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

create index if not exists check_in_notes_date_program_idx
  on public.check_in_notes (date, program);

drop trigger if exists check_in_notes_set_updated_at on public.check_in_notes;
create trigger check_in_notes_set_updated_at
before update on public.check_in_notes
for each row execute function public.set_updated_at();

alter table public.check_in_notes enable row level security;

drop policy if exists pilot_check_in_notes_all on public.check_in_notes;
create policy pilot_check_in_notes_all on public.check_in_notes
  for all to anon, authenticated using (true) with check (true);
