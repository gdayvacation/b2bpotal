-- Late amendment rules (Asia/Bangkok):
-- 1) Agents may book the next day until book_until_time today.
-- 2) Agents may modify / cancel until cancel_until_time the day before travel.
-- 3) After late_fee_from_time on that day, extra charges apply
--    (date change +date_change_fee_thb per AD/CH/TL; cancel = full price).
-- Run once in Supabase SQL Editor.

alter table public.booking_cutoffs
  add column if not exists late_fee_from_time text not null default '20:00';

alter table public.booking_cutoffs
  add column if not exists date_change_fee_thb int not null default 300;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_cutoffs_late_fee_from_time_check'
  ) then
    alter table public.booking_cutoffs
      add constraint booking_cutoffs_late_fee_from_time_check
      check (late_fee_from_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'booking_cutoffs_date_change_fee_thb_check'
  ) then
    alter table public.booking_cutoffs
      add constraint booking_cutoffs_date_change_fee_thb_check
      check (date_change_fee_thb >= 0 and date_change_fee_thb <= 20000);
  end if;
end $$;

alter table public.bookings
  add column if not exists late_change_fee int not null default 0;

update public.booking_cutoffs
set
  cancel_before_days = 1,
  cancel_until_time = '23:59',
  late_fee_from_time = coalesce(nullif(late_fee_from_time, ''), '20:00'),
  date_change_fee_thb = coalesce(date_change_fee_thb, 300),
  updated_at = timezone('utc', now())
where id = 'default';
