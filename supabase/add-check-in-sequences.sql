-- Pre-assigned boat-ticket sequence starts for marina check-in.
-- booking_code = '*' is the program-wide start (default 1).
-- Other booking_code rows override that booking’s first ticket number.
-- Run once in SQL Editor after add-check-in.sql.

create table if not exists public.check_in_sequences (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  start_number int not null check (start_number >= 1 and start_number <= 9999),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

create index if not exists check_in_sequences_date_program_idx
  on public.check_in_sequences (date, program);

drop trigger if exists check_in_sequences_set_updated_at on public.check_in_sequences;
create trigger check_in_sequences_set_updated_at
before update on public.check_in_sequences
for each row execute function public.set_updated_at();

alter table public.check_in_sequences enable row level security;

drop policy if exists pilot_check_in_sequences_all on public.check_in_sequences;
create policy pilot_check_in_sequences_all on public.check_in_sequences
  for all to anon, authenticated using (true) with check (true);
