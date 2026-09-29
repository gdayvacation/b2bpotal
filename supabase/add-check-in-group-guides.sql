-- Group guide name per booking (admin-assigned) + allow guide enrollments.
-- Run once in Supabase SQL Editor after add-check-in.sql / add-check-in-notes.sql.

create table if not exists public.check_in_group_guides (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  guide_name text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

create index if not exists check_in_group_guides_date_program_idx
  on public.check_in_group_guides (date, program);

drop trigger if exists check_in_group_guides_set_updated_at on public.check_in_group_guides;
create trigger check_in_group_guides_set_updated_at
before update on public.check_in_group_guides
for each row execute function public.set_updated_at();

alter table public.check_in_group_guides enable row level security;

drop policy if exists pilot_check_in_group_guides_all on public.check_in_group_guides;
create policy pilot_check_in_group_guides_all on public.check_in_group_guides
  for all to anon, authenticated using (true) with check (true);

-- Allow scope = 'guide' on enrollments (group guide check-in via QR).
alter table public.check_in_enrollments
  drop constraint if exists check_in_enrollments_scope_check;

alter table public.check_in_enrollments
  add constraint check_in_enrollments_scope_check
  check (scope in ('one', 'group', 'guide'));
