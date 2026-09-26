-- Partner / dummy boats for overflow sent to another company.
-- Safe to re-run. Own boats stay colored; partner boats store a free number + name.

alter table public.day_boat_plans
  add column if not exists boat_kinds jsonb not null default '["own","own","own"]'::jsonb;

alter table public.day_boat_plans
  add column if not exists boat_labels jsonb not null default '["","",""]'::jsonb;

update public.day_boat_plans
set boat_kinds = (
  select coalesce(jsonb_agg('own'::text), '["own","own","own"]'::jsonb)
  from generate_series(
    1,
    greatest(coalesce(jsonb_array_length(capacities), 3), 3)
  )
)
where boat_kinds is null
   or jsonb_typeof(boat_kinds) <> 'array'
   or jsonb_array_length(boat_kinds) = 0;

update public.day_boat_plans
set boat_labels = (
  select coalesce(jsonb_agg(''::text), '["","",""]'::jsonb)
  from generate_series(
    1,
    greatest(coalesce(jsonb_array_length(capacities), 3), 3)
  )
)
where boat_labels is null
   or jsonb_typeof(boat_labels) <> 'array'
   or jsonb_array_length(boat_labels) = 0;
