-- Partial top-up payments on agent prebuy allotments (multiple instalments per purchase).
-- Safe to re-run.

alter table public.agent_allotments
  add column if not exists payments jsonb not null default '[]'::jsonb;

-- Legacy rows with a paid_date and total were treated as fully paid — seed one payment.
update public.agent_allotments
set payments = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'amount', total_amount,
    'paidDate', paid_date::text,
    'note', ''
  )
)
where coalesce(jsonb_array_length(payments), 0) = 0
  and paid_date is not null
  and total_amount > 0;
