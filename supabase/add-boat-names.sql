-- Optional display names for day boats (e.g. "Rental Catamaran").
-- Run once in Supabase SQL Editor.
-- Safe without the flexible `capacities` column — defaults to 3 blank names.

alter table public.day_boat_plans
  add column if not exists boat_names jsonb not null default '["","",""]'::jsonb;

update public.day_boat_plans
set boat_names = '["","",""]'::jsonb
where boat_names is null
   or jsonb_typeof(boat_names) <> 'array'
   or jsonb_array_length(boat_names) = 0;

-- If you already ran add-flexible-day-boats.sql, stretch names to match capacities length.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'day_boat_plans'
      and column_name = 'capacities'
  ) then
    update public.day_boat_plans p
    set boat_names = (
      select coalesce(jsonb_agg(''::text), '[]'::jsonb)
      from generate_series(
        1,
        greatest(coalesce(jsonb_array_length(p.capacities), 0), 3)
      )
    )
    where jsonb_array_length(p.boat_names)
       <> greatest(coalesce(jsonb_array_length(p.capacities), 0), 3);
  end if;
end $$;
