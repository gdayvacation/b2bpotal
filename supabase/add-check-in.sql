-- Marina guest check-in (enrollments, attendance, payment ticks).
-- Shared across devices via Supabase — run once in SQL Editor.

create table if not exists public.check_in_enrollments (
  id text primary key,
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  first_name text not null,
  last_name text not null default '',
  nationality text not null default '',
  birthday text not null default '',
  passport_number text not null default '',
  scope text not null check (scope in ('one', 'group')),
  seats int not null default 1 check (seats >= 1),
  checked_in_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists check_in_enrollments_date_program_idx
  on public.check_in_enrollments (date, program);

create index if not exists check_in_enrollments_booking_idx
  on public.check_in_enrollments (booking_code);

drop trigger if exists check_in_enrollments_set_updated_at on public.check_in_enrollments;
create trigger check_in_enrollments_set_updated_at
before update on public.check_in_enrollments
for each row execute function public.set_updated_at();

create table if not exists public.check_in_attendance (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  status text not null check (status in ('checked', 'no-show')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

drop trigger if exists check_in_attendance_set_updated_at on public.check_in_attendance;
create trigger check_in_attendance_set_updated_at
before update on public.check_in_attendance
for each row execute function public.set_updated_at();

create table if not exists public.check_in_payments (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  seat_key text not null,
  status text not null check (status in ('paid')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, seat_key)
);

drop trigger if exists check_in_payments_set_updated_at on public.check_in_payments;
create trigger check_in_payments_set_updated_at
before update on public.check_in_payments
for each row execute function public.set_updated_at();

alter table public.check_in_enrollments enable row level security;
alter table public.check_in_attendance enable row level security;
alter table public.check_in_payments enable row level security;

drop policy if exists pilot_check_in_enrollments_all on public.check_in_enrollments;
create policy pilot_check_in_enrollments_all on public.check_in_enrollments
  for all to anon, authenticated using (true) with check (true);

drop policy if exists pilot_check_in_attendance_all on public.check_in_attendance;
create policy pilot_check_in_attendance_all on public.check_in_attendance
  for all to anon, authenticated using (true) with check (true);

drop policy if exists pilot_check_in_payments_all on public.check_in_payments;
create policy pilot_check_in_payments_all on public.check_in_payments
  for all to anon, authenticated using (true) with check (true);
