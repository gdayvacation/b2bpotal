-- Guest phone needs the real marina ticket sequence after check-in.
-- Guests can only SELECT their own booking row, so client-side sequence
-- math always starts at 1. This SECURITY DEFINER RPC rebuilds the same
-- van order as the admin board and returns that booking’s start/end only.
-- Run in the Supabase SQL editor after add-check-in-sequences.sql.

create or replace function public.portal_guest_ticket_sequence(p_code text)
returns table (
  booking_code text,
  start_number int,
  end_number int,
  seats int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_role text := public.jwt_role();
  v_booking public.bookings%rowtype;
  v_program_start int := 1;
  v_cursor int;
  v_start int;
  v_seats int;
  r record;
begin
  if v_code = '' then
    raise exception 'This check-in QR is not valid.';
  end if;

  select * into v_booking from public.bookings where code = v_code;
  if v_booking.code is null then
    raise exception 'This check-in QR is not valid.';
  end if;

  if v_role = 'guest' then
    if public.jwt_booking_code() is distinct from v_code then
      raise exception 'This check-in QR is not valid.';
    end if;
  elsif v_role = 'helper' then
    if public.jwt_helper_date() is distinct from v_booking.date::text then
      raise exception 'This check-in QR is not valid.';
    end if;
  elsif not public.jwt_is_staff() then
    raise exception 'This check-in QR is not valid.';
  end if;

  select s.start_number into v_program_start
  from public.check_in_sequences s
  where s.date = v_booking.date
    and s.program = v_booking.program
    and s.booking_code = '*'
  limit 1;
  if v_program_start is null or v_program_start < 1 then
    v_program_start := 1;
  end if;

  v_cursor := v_program_start;

  for r in
    with day_bookings as (
      select
        b.code,
        b.lead_guest,
        b.pickup_zone,
        greatest(
          1,
          coalesce(b.adults, 0)
            + coalesce(b.children, 0)
            + coalesce(b.infants, 0)
            + coalesce(b.tour_leaders, 0)
        ) as seats,
        lower(trim(coalesce(b.pickup_zone, ''))) = 'no transfer' as is_no_transfer
      from public.bookings b
      where b.date = v_booking.date
        and b.program = v_booking.program
        and b.status is distinct from 'Cancelled'
    ),
    primary_van as (
      select
        va.booking_code,
        min(va.van_number) filter (
          where va.van_number is distinct from 97
            and va.van_number is distinct from 99
        ) as van_number
      from public.van_assignments va
      where va.date = v_booking.date
        and va.program = v_booking.program
      group by va.booking_code
    ),
    van_sort as (
      select
        va.booking_code,
        va.van_number,
        min(coalesce(va.sort_order, 0)) as sort_order
      from public.van_assignments va
      where va.date = v_booking.date
        and va.program = v_booking.program
        and va.van_number is distinct from 97
        and va.van_number is distinct from 99
      group by va.booking_code, va.van_number
    ),
    ordered as (
      select
        d.code,
        d.seats,
        case
          when not d.is_no_transfer and pv.van_number is not null then 0
          when not d.is_no_transfer then 1
          else 2
        end as bucket,
        coalesce(pv.van_number, 9999) as van_number,
        coalesce(vs.sort_order, 9999) as sort_order,
        d.lead_guest
      from day_bookings d
      left join primary_van pv on pv.booking_code = d.code
      left join van_sort vs
        on vs.booking_code = d.code
       and vs.van_number = pv.van_number
      order by
        bucket,
        van_number,
        sort_order,
        d.lead_guest,
        d.code
    )
    select o.code, o.seats
    from ordered o
  loop
    select s.start_number into v_start
    from public.check_in_sequences s
    where s.date = v_booking.date
      and s.program = v_booking.program
      and s.booking_code = r.code
    limit 1;

    if v_start is null or v_start < 1 then
      v_start := v_cursor;
    end if;

    v_seats := greatest(1, r.seats);

    if r.code = v_code then
      booking_code := r.code;
      start_number := v_start;
      end_number := v_start + v_seats - 1;
      seats := v_seats;
      return next;
      return;
    end if;

    v_cursor := greatest(v_cursor, v_start + v_seats);
  end loop;

  -- Booking missing from ordered set (should not happen) — fall back to program start.
  booking_code := v_code;
  seats := greatest(
    1,
    coalesce(v_booking.adults, 0)
      + coalesce(v_booking.children, 0)
      + coalesce(v_booking.infants, 0)
      + coalesce(v_booking.tour_leaders, 0)
  );
  start_number := v_program_start;
  end_number := v_program_start + seats - 1;
  return next;
end;
$$;

revoke all on function public.portal_guest_ticket_sequence(text) from public;
grant execute on function public.portal_guest_ticket_sequence(text) to anon, authenticated;
