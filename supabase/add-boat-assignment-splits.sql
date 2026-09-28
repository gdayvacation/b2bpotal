-- Allow one booking to sit on more than one boat (pax per boat).
-- Run in the Supabase SQL editor.

alter table public.boat_assignments
  add column if not exists pax int;

do $$
declare
  pk_name text;
begin
  select con.conname into pk_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'boat_assignments'
    and con.contype = 'p'
  limit 1;

  if pk_name is not null then
    execute format('alter table public.boat_assignments drop constraint %I', pk_name);
  end if;
end $$;

alter table public.boat_assignments
  add constraint boat_assignments_pkey
  primary key (date, program, booking_code, boat_number);
