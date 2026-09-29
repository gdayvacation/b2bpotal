-- AD/CH price per head and head counts for agent prebuy allotments.
-- seats stays as AD+CH total for history / daily checker. Safe to re-run.

alter table public.agent_allotments
  add column if not exists adult_price numeric not null default 0
    check (adult_price >= 0);

alter table public.agent_allotments
  add column if not exists child_price numeric not null default 0
    check (child_price >= 0);

alter table public.agent_allotments
  add column if not exists adult_seats integer not null default 0
    check (adult_seats >= 0);

alter table public.agent_allotments
  add column if not exists child_seats integer not null default 0
    check (child_seats >= 0);

-- Backfill older rows: all seats counted as AD; derive AD price from total when possible.
update public.agent_allotments
set
  adult_seats = seats,
  child_seats = 0,
  adult_price = case
    when seats > 0 and adult_price = 0 and total_amount > 0
      then round(total_amount / seats, 2)
    else adult_price
  end
where adult_seats = 0 and child_seats = 0 and seats > 0;
