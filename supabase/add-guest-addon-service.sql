-- Guest phones can add one priced add-on after check-in.
-- Prices are fixed in this function so the phone cannot send its own amount.
-- Keep the amounts in sync with lib/check-in-addon-catalog.ts.
-- Safe to re-run.

drop function if exists public.portal_guest_add_check_in_service(date, text, text, text, integer);

create or replace function public.portal_guest_add_check_in_service(
  p_date date,
  p_program text,
  p_booking_code text,
  p_kind text,
  p_people integer,
  p_band text default 'adult'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code text := trim(coalesce(p_booking_code, ''));
  v_kind text := trim(coalesce(p_kind, ''));
  v_booking record;
  v_attendance text;
  v_pax int;
  v_cap int;
  v_people int;
  v_price int;
  v_count int;
  v_existing int;
  v_id text;
begin
  if not (
    public.jwt_is_staff()
    or (
      public.jwt_role() = 'helper'
      and p_date::text = public.jwt_helper_date()
    )
    or (
      public.jwt_role() = 'guest'
      and v_code = public.jwt_booking_code()
      and p_date::text = public.jwt_booking_date()
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'Not allowed to add a service on this booking.');
  end if;

  if p_program is distinct from 'PP' and p_program is distinct from 'James Bond' then
    return jsonb_build_object('ok', false, 'error', 'Invalid program.');
  end if;

  if v_kind not in ('share-longtail', 'private-longtail', 'scuba') then
    return jsonb_build_object('ok', false, 'error', 'Unknown service.');
  end if;

  if p_people is null or p_people < 1 or p_people > 40 then
    return jsonb_build_object('ok', false, 'error', 'Choose how many people.');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.code = v_code
    and b.date = p_date
    and b.program = p_program
    and b.status is distinct from 'Cancelled'
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Booking not found for this date and program.');
  end if;

  select a.status into v_attendance
  from public.check_in_attendance a
  where a.date = p_date
    and a.program = p_program
    and a.booking_code = v_code;

  if v_attendance is not distinct from 'no-show' then
    return jsonb_build_object('ok', false, 'error', 'This booking is marked no-show.');
  end if;

  v_pax := greatest(
    1,
    coalesce(v_booking.adults, 0)
      + coalesce(v_booking.children, 0)
      + coalesce(v_booking.infants, 0)
      + coalesce(v_booking.tour_leaders, 0)
  );

  if v_kind = 'scuba' then
    v_cap := least(40, v_pax);
    if p_people > v_cap then
      return jsonb_build_object('ok', false, 'error', 'That is more people than this booking.');
    end if;
    v_people := p_people;
    v_price := 2000;
  elsif v_kind = 'share-longtail' then
    if p_band = 'child' then
      v_cap := coalesce(v_booking.children, 0);
      select coalesce(sum(s.people), 0) into v_existing
      from public.check_in_services s
      where s.date = p_date
        and s.program = p_program
        and s.booking_code = v_code
        and s.kind = 'share-longtail'
        and s.price_per_person = 300;
      if p_people + v_existing > v_cap then
        return jsonb_build_object('ok', false, 'error', 'That is more children than this booking.');
      end if;
      if not exists (
        select 1
        from public.check_in_services s
        where s.date = p_date
          and s.program = p_program
          and s.booking_code = v_code
          and s.kind = 'share-longtail'
          and s.price_per_person = 500
          and s.people >= 1
      ) then
        return jsonb_build_object('ok', false, 'error', 'Add an adult on the shared boat before a child.');
      end if;
      v_price := 300;
    else
      v_cap := coalesce(v_booking.adults, 0);
      select coalesce(sum(s.people), 0) into v_existing
      from public.check_in_services s
      where s.date = p_date
        and s.program = p_program
        and s.booking_code = v_code
        and s.kind = 'share-longtail'
        and s.price_per_person <> 300;
      if p_people + v_existing > v_cap then
        return jsonb_build_object('ok', false, 'error', 'That is more adults than this booking.');
      end if;
      v_price := 500;
    end if;
    select coalesce(sum(s.people), 0) into v_existing
    from public.check_in_services s
    where s.date = p_date
      and s.program = p_program
      and s.booking_code = v_code
      and s.kind = 'share-longtail';
    if p_people + v_existing > 10 then
      return jsonb_build_object('ok', false, 'error', 'A shared boat holds up to 10 people on this booking.');
    end if;
    v_people := p_people;
  else
    -- Private boats may include guests from other bookings, up to 10.
    if p_people > 10 then
      return jsonb_build_object('ok', false, 'error', 'A private boat holds up to 10 people.');
    end if;
    v_people := 1;
    v_price := case
      when p_people <= 4 then 2500
      when p_people <= 7 then 3000
      else 4000
    end;
  end if;

  select count(*) into v_count
  from public.check_in_services s
  where s.date = p_date
    and s.program = p_program
    and s.booking_code = v_code;

  if v_count >= 20 then
    return jsonb_build_object('ok', false, 'error', 'Too many add-on services on this booking.');
  end if;

  v_id := gen_random_uuid()::text;

  insert into public.check_in_services (
    id, date, program, booking_code, kind, people, price_per_person, paid
  ) values (
    v_id, p_date, p_program, v_code, v_kind, v_people, v_price, false
  );

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'kind', v_kind,
    'people', v_people,
    'price_per_person', v_price,
    'paid', false
  );
end;
$function$;

revoke all on function public.portal_guest_add_check_in_service(date, text, text, text, integer, text) from public, anon;
grant execute on function public.portal_guest_add_check_in_service(date, text, text, text, integer, text) to authenticated, service_role;
