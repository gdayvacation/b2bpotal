-- Enable live van/boat board + pickup NS sync across admin tablets.
-- Safe to re-run. Polling still works without this; Realtime makes updates near-instant.

do $$
declare
  t text;
begin
  foreach t in array array[
    'day_boat_plans',
    'boat_assignments',
    'day_vehicle_plans',
    'van_assignments',
    'van_meta',
    'check_in_booked_pax',
    'pickup_no_shows',
    'check_in_arrived_pax'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
