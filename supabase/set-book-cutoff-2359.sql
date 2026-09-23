-- Align last-book cutoff with ops rule:
-- close at 23:59 Bangkok the day before travel.
-- After midnight, today is closed; tomorrow is already open.

update public.booking_cutoffs
set
  book_before_days = 1,
  book_until_time = '23:59',
  cancel_before_days = 1,
  cancel_until_time = '23:59',
  updated_at = timezone('utc', now())
where id = 'default';
