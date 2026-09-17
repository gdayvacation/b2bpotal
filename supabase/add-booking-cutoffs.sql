-- Booking cutoffs (singleton settings): when agents may book / cancel relative to travel date.
-- Run once in Supabase SQL Editor.

create table if not exists public.booking_cutoffs (
  id text primary key default 'default' check (id = 'default'),
  timezone text not null default 'Asia/Bangkok',
  book_before_days int not null default 1
    check (book_before_days >= 0 and book_before_days <= 30),
  book_until_time text not null default '18:00'
    check (book_until_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  cancel_before_days int not null default 1
    check (cancel_before_days >= 0 and cancel_before_days <= 30),
  cancel_until_time text not null default '16:00'
    check (cancel_until_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists booking_cutoffs_set_updated_at on public.booking_cutoffs;
create trigger booking_cutoffs_set_updated_at
before update on public.booking_cutoffs
for each row execute function public.set_updated_at();

insert into public.booking_cutoffs (id)
values ('default')
on conflict (id) do nothing;

alter table public.booking_cutoffs enable row level security;

drop policy if exists pilot_booking_cutoffs_all on public.booking_cutoffs;
create policy pilot_booking_cutoffs_all on public.booking_cutoffs
  for all to anon, authenticated using (true) with check (true);
