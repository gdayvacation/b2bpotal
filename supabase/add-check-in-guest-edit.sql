-- Staff-opened guest self-edit unlocks (insurance details).
-- A guest can edit on their phone only while their enrollment row is open.
-- Run once in SQL Editor after add-check-in.sql.

create table if not exists public.check_in_guest_edits (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  enrollment_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code, enrollment_id)
);

create index if not exists check_in_guest_edits_date_program_idx
  on public.check_in_guest_edits (date, program);

drop trigger if exists check_in_guest_edits_set_updated_at on public.check_in_guest_edits;
create trigger check_in_guest_edits_set_updated_at
before update on public.check_in_guest_edits
for each row execute function public.set_updated_at();

alter table public.check_in_guest_edits enable row level security;

drop policy if exists pilot_check_in_guest_edits_all on public.check_in_guest_edits;
create policy pilot_check_in_guest_edits_all on public.check_in_guest_edits
  for all to anon, authenticated using (true) with check (true);
