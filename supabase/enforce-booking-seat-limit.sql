-- Keep a day's booked seats at or under the number set on Availability.
--
-- The old check lived in the browser. Each agent can only read their own
-- bookings, so two agencies (or two tabs) could both see seats left and
-- both save. The database now locks the day and rejects the extra seats.
-- Adults, children, infants, and tour leaders all count — the same total
-- the Availability calendar shows. Cancelled bookings do not count.
-- Days that are already over the limit stay as they are; lowering a
-- booking, cancelling it, or moving it off that day is still allowed.

create or replace function public.enforce_booking_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_seats integer := 0;
  v_old_seats integer := 0;
  v_booked integer;
  v_capacity integer;
  v_before integer;
  v_left integer;
  v_old_key text;
  v_new_key text;
begin
  -- Not callable as an API. It only runs as a row trigger.
  if tg_op is null then
    raise exception 'Not authorized.';
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from 'Cancelled' then
    v_old_seats :=
      coalesce(old.adults, 0) + coalesce(old.children, 0)
      + coalesce(old.infants, 0) + coalesce(old.tour_leaders, 0);
  end if;

  if new.status is distinct from 'Cancelled' then
    v_new_seats :=
      coalesce(new.adults, 0) + coalesce(new.children, 0)
      + coalesce(new.infants, 0) + coalesce(new.tour_leaders, 0);
  end if;

  -- Cancels and no-shows free seats, including on a day that is already over.
  if v_new_seats <= 0 then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.date = new.date
     and old.program = new.program
     and v_new_seats <= v_old_seats then
    return new;
  end if;

  v_new_key := new.date::text || '|' || new.program;
  if tg_op = 'UPDATE'
     and (old.date is distinct from new.date or old.program is distinct from new.program) then
    v_old_key := old.date::text || '|' || old.program;
    if v_old_key < v_new_key then
      perform pg_advisory_xact_lock(hashtext('gday.seat-limit'), hashtext(v_old_key));
      perform pg_advisory_xact_lock(hashtext('gday.seat-limit'), hashtext(v_new_key));
    else
      perform pg_advisory_xact_lock(hashtext('gday.seat-limit'), hashtext(v_new_key));
      perform pg_advisory_xact_lock(hashtext('gday.seat-limit'), hashtext(v_old_key));
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('gday.seat-limit'), hashtext(v_new_key));
  end if;

  -- See a capacity change that is saving at the same moment.
  perform 1 from public.availability where date = new.date for update;

  select coalesce(sum(
           coalesce(adults, 0) + coalesce(children, 0)
           + coalesce(infants, 0) + coalesce(tour_leaders, 0)
         ), 0)::integer
    into v_booked
  from public.bookings
  where date = new.date
    and program = new.program
    and status <> 'Cancelled';

  select coalesce(
           (select case
              when new.program = 'PP' then pp_capacity
              else james_bond_capacity
            end
            from public.availability
            where date = new.date),
           case when new.program = 'PP' then 44 else 40 end
         )
    into v_capacity;

  if tg_op = 'UPDATE'
     and old.date = new.date
     and old.program = new.program then
    v_before := v_booked - v_new_seats + v_old_seats;
  else
    v_before := v_booked - v_new_seats;
  end if;

  if v_booked > v_capacity then
    v_left := greatest(0, v_capacity - v_before);
    if v_left <= 0 then
      raise exception 'SEAT_LIMIT: % is sold out on % (% seats).',
        new.program, to_char(new.date, 'YYYY-MM-DD'), v_capacity
        using errcode = '23514';
    end if;
    raise exception 'SEAT_LIMIT: Only % seat% left for % on % (capacity %).',
      v_left,
      case when v_left = 1 then '' else 's' end,
      new.program,
      to_char(new.date, 'YYYY-MM-DD'),
      v_capacity
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_enforce_seat_limit on public.bookings;
create trigger bookings_enforce_seat_limit
after insert or update of date, program, adults, children, infants, tour_leaders, status
on public.bookings
for each row
execute function public.enforce_booking_seat_limit();

revoke all on function public.enforce_booking_seat_limit() from public;
revoke all on function public.enforce_booking_seat_limit() from anon;
grant execute on function public.enforce_booking_seat_limit() to authenticated, service_role;

-- Totals only. An agent never receives another agency's guest names.
create or replace function public.portal_seat_usage(p_from date, p_to date)
returns table (travel_date date, program text, booked integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role'
     and public.jwt_is_staff() is distinct from true
     and public.jwt_role() is distinct from 'partner'
     and public.jwt_role() is distinct from 'helper' then
    raise exception 'Not authorized.';
  end if;

  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + 800 then
    raise exception 'Choose a valid date range.';
  end if;

  return query
  select b.date,
         b.program,
         coalesce(sum(
           coalesce(b.adults, 0) + coalesce(b.children, 0)
           + coalesce(b.infants, 0) + coalesce(b.tour_leaders, 0)
         ), 0)::integer
  from public.bookings b
  where b.date >= p_from
    and b.date <= p_to
    and b.status <> 'Cancelled'
    and b.program in ('PP', 'James Bond')
  group by b.date, b.program;
end;
$$;

revoke all on function public.portal_seat_usage(date, date) from public;
revoke all on function public.portal_seat_usage(date, date) from anon;
grant execute on function public.portal_seat_usage(date, date) to authenticated, service_role;

notify pgrst, 'reload schema';
