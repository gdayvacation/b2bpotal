-- Flexible day boat fleet: any count of boats (not fixed to 3), per-boat capacity.
-- Run once in Supabase SQL Editor.
-- Keeps capacity_1/2/3 in sync for older clients; source of truth is capacities jsonb.

alter table public.day_boat_plans
  add column if not exists capacities jsonb not null default '[44, 44, 44]'::jsonb;

update public.day_boat_plans
set capacities = jsonb_build_array(capacity_1, capacity_2, capacity_3)
where capacities is null
   or jsonb_typeof(capacities) <> 'array'
   or jsonb_array_length(capacities) = 0;

-- Allow boat numbers beyond 1–3 (rental / extra boats).
do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'boat_assignments'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%boat_number%';
  if constraint_name is not null then
    execute format('alter table public.boat_assignments drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.boat_assignments
  add constraint boat_assignments_boat_number_check
  check (boat_number >= 1);
