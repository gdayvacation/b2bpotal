-- Enable live booking sync across devices (Supabase Realtime).
-- Run once in the SQL editor if bookings do not update until refresh.
-- Polling every 4s still works without this; Realtime makes updates instant.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bookings'
  ) then
    execute 'alter publication supabase_realtime add table public.bookings';
  end if;
end $$;
