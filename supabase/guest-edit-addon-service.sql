-- Guests can change or remove an add-on they added after check-in.
-- The database sets the price. Paid lines stay locked for marina staff.
-- Keep the amounts in sync with lib/check-in-addon-catalog.ts and
-- portal_guest_add_check_in_service.
-- Safe to re-run.

alter table public.check_in_services replica identity full;

create or replace function public.portal_guest_update_check_in_service(
  p_date date,
  p_program text,
  p_booking_code text,
  p_id text,
  p_people integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code text := trim(coalesce(p_booking_code, ''));
  v_id text := trim(coalesce(p_id, ''));
  v_booking record;
  v_row public.check_in_services%rowtype;
  v_attendance text;
  v_pax int;
  v_cap int;
  v_people int;
  v_price int;
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
    return jsonb_build_object('ok', false, 'error', 'Not allowed to change a service on this booking.');
  end if;

  if p_program is distinct from 'PP' and p_program is distinct from 'James Bond' then
    return jsonb_build_object('ok', false, 'error', 'Invalid program.');
  end if;

  if v_id = '' then
    return jsonb_build_object('ok', false, 'error', 'That add-on was not found.');
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

  select *
  into v_row
  from public.check_in_services s
  where s.id = v_id
    and s.date = p_date
    and s.program = p_program
    and s.booking_code = v_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'That add-on was not found.');
  end if;

  if v_row.paid then
    return jsonb_build_object('ok', false, 'error', 'This add-on is already paid. Please ask marina staff.');
  end if;

  if v_row.kind not in ('share-longtail', 'private-longtail', 'scuba') then
    return jsonb_build_object('ok', false, 'error', 'Unknown service.');
  end if;

  v_pax := greatest(
    1,
    coalesce(v_booking.adults, 0)
      + coalesce(v_booking.children, 0)
      + coalesce(v_booking.infants, 0)
      + coalesce(v_booking.tour_leaders, 0)
  );

  if v_row.kind = 'scuba' then
    v_cap := least(40, v_pax);
    if p_people > v_cap then
      return jsonb_build_object('ok', false, 'error', 'That is more people than this booking.');
    end if;
    v_people := p_people;
    v_price := 2000;
  elsif v_row.kind = 'share-longtail' then
    v_cap := least(10, v_pax);
    if p_people > v_cap then
      return jsonb_build_object('ok', false, 'error', 'A shared boat holds up to 10 people on this booking.');
    end if;
    v_people := p_people;
    v_price := 500;
  else
    v_cap := least(10, v_pax);
    if p_people > v_cap then
      return jsonb_build_object('ok', false, 'error', 'A private boat holds up to 10 people.');
    end if;
    v_people := 1;
    v_price := case
      when p_people <= 4 then 2500
      when p_people <= 7 then 3000
      else 4000
    end;
  end if;

  update public.check_in_services
  set people = v_people,
      price_per_person = v_price
  where id = v_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'kind', v_row.kind,
    'people', v_people,
    'price_per_person', v_price,
    'paid', false
  );
end;
$function$;

create or replace function public.portal_guest_remove_check_in_service(
  p_date date,
  p_program text,
  p_booking_code text,
  p_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code text := trim(coalesce(p_booking_code, ''));
  v_id text := trim(coalesce(p_id, ''));
  v_row public.check_in_services%rowtype;
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
    return jsonb_build_object('ok', false, 'error', 'Not allowed to remove a service on this booking.');
  end if;

  if p_program is distinct from 'PP' and p_program is distinct from 'James Bond' then
    return jsonb_build_object('ok', false, 'error', 'Invalid program.');
  end if;

  if v_id = '' then
    return jsonb_build_object('ok', false, 'error', 'That add-on was not found.');
  end if;

  select *
  into v_row
  from public.check_in_services s
  where s.id = v_id
    and s.date = p_date
    and s.program = p_program
    and s.booking_code = v_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'That add-on was not found.');
  end if;

  if v_row.paid then
    return jsonb_build_object('ok', false, 'error', 'This add-on is already paid. Please ask marina staff.');
  end if;

  delete from public.check_in_services where id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

revoke all on function public.portal_guest_update_check_in_service(date, text, text, text, integer) from public, anon;
grant execute on function public.portal_guest_update_check_in_service(date, text, text, text, integer) to authenticated, service_role;

revoke all on function public.portal_guest_remove_check_in_service(date, text, text, text) from public, anon;
grant execute on function public.portal_guest_remove_check_in_service(date, text, text, text) to authenticated, service_role;
