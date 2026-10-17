-- Next booking number is chosen in the database, under a lock, from every
-- booking in that month. Partners can only read their own rows, so a
-- browser-side "max code I can see + 1" collides with another agent's booking
-- (bookings.code is the primary key).
--
-- The counter lives in private so it is not exposed through the Data API.
-- The function returns only the new code, never another agent's booking.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.booking_code_counters (
  stem text primary key,
  last_seq integer not null check (last_seq >= 0)
);

alter table private.booking_code_counters enable row level security;
revoke all on table private.booking_code_counters from public, anon, authenticated;

create or replace function public.portal_allocate_booking_code(p_program text, p_date date)
returns text
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_prefix text;
  v_stem text;
  v_existing integer;
  v_seq integer;
begin
  if auth.role() is distinct from 'service_role'
     and public.jwt_is_staff() is distinct from true
     and public.jwt_role() is distinct from 'partner' then
    raise exception 'Not authorized.';
  end if;

  if p_program = 'PP' then
    v_prefix := 'PP';
  elsif p_program = 'James Bond' then
    v_prefix := 'JB';
  else
    raise exception 'Unknown program.';
  end if;

  if p_date is null then
    raise exception 'Travel date is required.';
  end if;

  v_stem := v_prefix || to_char(p_date, 'YYMM') || '-';

  -- One allocator at a time per month, including the max() read below.
  perform pg_advisory_xact_lock(hashtext('gday.booking_code'), hashtext(v_stem));

  select coalesce(max((substring(code from '([0-9]+)$'))::integer), 0)
    into v_existing
  from public.bookings
  where code like v_stem || '%'
    and code ~ ('^' || v_stem || '[0-9]+$');

  insert into private.booking_code_counters as counters (stem, last_seq)
  values (v_stem, v_existing)
  on conflict (stem) do update
    set last_seq = greatest(counters.last_seq, excluded.last_seq);

  update private.booking_code_counters
     set last_seq = last_seq + 1
   where stem = v_stem
   returning last_seq into v_seq;

  if v_seq is null or v_seq < 1 then
    raise exception 'Could not allocate a booking code.';
  end if;

  return v_stem || lpad(v_seq::text, 4, '0');
end;
$$;

revoke all on function public.portal_allocate_booking_code(text, date) from public;
revoke all on function public.portal_allocate_booking_code(text, date) from anon;
grant execute on function public.portal_allocate_booking_code(text, date) to authenticated, service_role;
