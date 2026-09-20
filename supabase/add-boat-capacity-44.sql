-- Default boat capacity: 44 pax per boat.
-- Run once in Supabase SQL Editor.
-- Updates column defaults; existing day plans keep their saved capacities
-- unless you also run the optional UPDATE below.

alter table public.day_boat_plans
  alter column capacity_1 set default 44;

alter table public.day_boat_plans
  alter column capacity_2 set default 44;

alter table public.day_boat_plans
  alter column capacity_3 set default 44;

-- Optional: bump plans that still use the old 25 default on all three boats.
update public.day_boat_plans
set
  capacity_1 = 44,
  capacity_2 = 44,
  capacity_3 = 44
where capacity_1 = 25
  and capacity_2 = 25
  and capacity_3 = 25;
