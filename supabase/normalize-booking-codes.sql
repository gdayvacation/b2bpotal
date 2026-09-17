-- Normalize legacy booking codes (PP-260917-001 / JB-261122-001)
-- to monthly format: PP2609-0001 / JB2611-0002
--
-- Format = program (PP|JB) + YY + MM + '-' + 4-digit sequence (per program per month)
-- Run once in Supabase SQL Editor. Safe with mixed old/new codes.

do $$
declare
  boat_fk text;
  van_fk text;
begin
  select conname into boat_fk
  from pg_constraint
  where conrelid = 'public.boat_assignments'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) ilike '%booking_code%'
  limit 1;

  select conname into van_fk
  from pg_constraint
  where conrelid = 'public.van_assignments'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) ilike '%booking_code%'
  limit 1;

  if boat_fk is not null then
    execute format('alter table public.boat_assignments drop constraint %I', boat_fk);
  end if;
  if van_fk is not null then
    execute format('alter table public.van_assignments drop constraint %I', van_fk);
  end if;

  create temporary table booking_code_map on commit drop as
  with legacy as (
    select
      code as old_code,
      date,
      case when program = 'PP' then 'PP' else 'JB' end
        || to_char(date, 'YYMM')
        || '-' as stem
    from public.bookings
    where code ~ '^(PP|JB)-[0-9]{6}-[0-9]+$'
  ),
  stem_max as (
    select
      left(code, 7) as stem,
      max(substring(code from 8)::int) as max_seq
    from public.bookings
    where code ~ '^(PP|JB)[0-9]{4}-[0-9]+$'
    group by 1
  ),
  ranked as (
    select
      l.old_code,
      l.stem
        || lpad(
          (
            coalesce(s.max_seq, 0)
            + row_number() over (partition by l.stem order by l.date, l.old_code)
          )::text,
          4,
          '0'
        ) as new_code
    from legacy l
    left join stem_max s on s.stem = l.stem
  )
  select old_code, new_code
  from ranked
  where old_code is distinct from new_code;

  if exists (select 1 from booking_code_map) then
    update public.boat_assignments a
    set booking_code = '__tmp__' || a.booking_code
    from booking_code_map m
    where a.booking_code = m.old_code;

    update public.van_assignments a
    set booking_code = '__tmp__' || a.booking_code
    from booking_code_map m
    where a.booking_code = m.old_code;

    update public.bookings b
    set code = '__tmp__' || b.code
    from booking_code_map m
    where b.code = m.old_code;

    update public.bookings b
    set code = m.new_code
    from booking_code_map m
    where b.code = '__tmp__' || m.old_code;

    update public.boat_assignments a
    set booking_code = m.new_code
    from booking_code_map m
    where a.booking_code = '__tmp__' || m.old_code;

    update public.van_assignments a
    set booking_code = m.new_code
    from booking_code_map m
    where a.booking_code = '__tmp__' || m.old_code;
  end if;

  alter table public.boat_assignments
    add constraint boat_assignments_booking_code_fkey
    foreign key (booking_code) references public.bookings (code) on delete cascade;

  alter table public.van_assignments
    add constraint van_assignments_booking_code_fkey
    foreign key (booking_code) references public.bookings (code) on delete cascade;
end $$;
