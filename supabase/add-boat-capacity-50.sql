-- Default boat capacity: 50 pax per boat from today (Asia/Bangkok) onward.
-- Safe to re-run.

alter table public.day_boat_plans
  alter column capacity_1 set default 50;

alter table public.day_boat_plans
  alter column capacity_2 set default 50;

alter table public.day_boat_plans
  alter column capacity_3 set default 50;

alter table public.day_boat_plans
  alter column capacities set default '[50, 50, 50]'::jsonb;

update public.day_boat_plans
set
  capacity_1 = case when capacity_1 = 44 then 50 else capacity_1 end,
  capacity_2 = case when capacity_2 = 44 then 50 else capacity_2 end,
  capacity_3 = case when capacity_3 = 44 then 50 else capacity_3 end,
  capacities = (
    select coalesce(jsonb_agg(
      case
        when jsonb_typeof(value) = 'number' and (value::text)::int = 44 then to_jsonb(50)
        else value
      end
    ), '[50, 50, 50]'::jsonb)
    from jsonb_array_elements(
      case
        when jsonb_typeof(capacities) = 'array' then capacities
        else jsonb_build_array(capacity_1, capacity_2, capacity_3)
      end
    )
  )
where date >= (timezone('Asia/Bangkok', now()))::date;
