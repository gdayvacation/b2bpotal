-- Push-based sync for the remaining check-in / settings tables so the app can poll far less often.
-- Safe to re-run: only adds tables that are not already in the realtime publication.
do $$
declare
  t text;
begin
  foreach t in array array[
    'check_in_payments',
    'check_in_services',
    'check_in_sequences',
    'check_in_guest_edits',
    'check_in_notes',
    'check_in_group_guides',
    'own_arrivals',
    'job_order_actions',
    'availability',
    'booking_cutoffs',
    'booking_closures'
  ]
  loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
