-- Guest self check-in: portal_record_check_in_enrollments locks the booking with
-- SELECT ... FOR UPDATE. Under RLS that needs an UPDATE policy, which guests do not
-- have, so guests always got "Booking not found". Run as definer with an explicit
-- caller check instead (staff, helper for that date, or the guest's own booking).
-- Same signature and return shape, so no app change is needed.
-- Tour group guides: check_in_group_guides.guide_name may list several guides, one per
-- line; each line allows one guide check-in.

create or replace function public.portal_record_check_in_enrollments(
  p_date date,
  p_program text,
  p_booking_code text,
  p_enrollments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking record;
  v_seat_total int;
  v_existing_guest_seats int;
  v_existing_guide_count int;
  v_new_guest_seats int;
  v_new_guide_count int;
  v_item jsonb;
  v_scope text;
  v_id text;
  v_seats int;
  v_remaining int;
  v_fully boolean := false;
  v_attendance text;
  v_guide_slots int := 0;
begin
  if not (
    public.jwt_is_staff()
    or (public.jwt_role() = 'helper' and p_date::text = public.jwt_helper_date())
    or (public.jwt_role() = 'guest' and trim(p_booking_code) = public.jwt_booking_code())
  ) then
    return jsonb_build_object('ok', false, 'error', 'Not allowed to check in this booking.');
  end if;

  if p_program is distinct from 'PP' and p_program is distinct from 'James Bond' then
    return jsonb_build_object('ok', false, 'error', 'Invalid program.');
  end if;

  if p_enrollments is null
     or jsonb_typeof(p_enrollments) <> 'array'
     or jsonb_array_length(p_enrollments) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Add at least one guest.');
  end if;

  if jsonb_array_length(p_enrollments) > 200 then
    return jsonb_build_object('ok', false, 'error', 'Too many guests in one check-in.');
  end if;

  select *
  into v_booking
  from public.bookings b
  where b.code = trim(p_booking_code)
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
    and a.booking_code = trim(p_booking_code);

  if v_attendance is not distinct from 'no-show' then
    return jsonb_build_object(
      'ok', false,
      'error',
      'Marked no-show at pickup. Ask admin to allow late check-in if guests arrived.'
    );
  end if;

  perform 1
  from public.check_in_enrollments e
  where e.date = p_date
    and e.program = p_program
    and e.booking_code = trim(p_booking_code)
  for update;

  select
    coalesce(sum(case when e.scope = 'guide' then 0 else greatest(e.seats, 1) end), 0),
    coalesce(sum(case when e.scope = 'guide' then 1 else 0 end), 0)
  into v_existing_guest_seats, v_existing_guide_count
  from public.check_in_enrollments e
  where e.date = p_date
    and e.program = p_program
    and e.booking_code = trim(p_booking_code);

  select coalesce(
    (
      select a.adults + a.children + a.infants + a.tour_leaders
      from public.check_in_arrived_pax a
      where a.date = p_date
        and a.program = p_program
        and a.booking_code = trim(p_booking_code)
    ),
    coalesce(v_booking.adults, 0)
      + coalesce(v_booking.children, 0)
      + coalesce(v_booking.infants, 0)
      + coalesce(v_booking.tour_leaders, 0)
  )
  into v_seat_total;

  v_seat_total := greatest(coalesce(v_seat_total, 0), 1);

  v_new_guest_seats := 0;
  v_new_guide_count := 0;

  for v_item in select value from jsonb_array_elements(p_enrollments) as t(value)
  loop
    v_scope := coalesce(nullif(trim(v_item->>'scope'), ''), 'one');
    if v_scope = 'guide' then
      v_new_guide_count := v_new_guide_count + 1;
    else
      v_seats := greatest(1, coalesce(nullif(v_item->>'seats', '')::int, 1));
      v_new_guest_seats := v_new_guest_seats + v_seats;
    end if;
  end loop;

  if v_new_guide_count > 0 then
    if v_new_guide_count <> 1 or jsonb_array_length(p_enrollments) <> 1 then
      return jsonb_build_object('ok', false, 'error', 'Tour group guide check-in is for one person only.');
    end if;
    -- guide_name holds one guide per line; each line is one guide check-in slot.
    select coalesce(sum(case when length(trim(line)) > 0 then 1 else 0 end), 0)::int
    into v_guide_slots
    from public.check_in_group_guides g
    cross join lateral regexp_split_to_table(coalesce(g.guide_name, ''), E'\n') as line
    where g.date = p_date
      and g.program = p_program
      and g.booking_code = trim(p_booking_code);
    if v_guide_slots = 0 then
      return jsonb_build_object('ok', false, 'error', 'No tour group guide was added for this booking.');
    end if;
    if v_existing_guide_count >= v_guide_slots then
      return jsonb_build_object(
        'ok', false,
        'error',
        case when v_guide_slots = 1
          then 'Tour group guide is already checked in.'
          else 'All tour group guides are already checked in.'
        end
      );
    end if;
  end if;

  if v_new_guest_seats > 0 then
    if v_existing_guest_seats >= v_seat_total then
      return jsonb_build_object('ok', false, 'error', 'This booking is already fully checked in.');
    end if;
    v_remaining := v_seat_total - v_existing_guest_seats;
    if v_new_guest_seats > v_remaining then
      return jsonb_build_object(
        'ok', false,
        'error',
        format(
          'Only %s seat%s left to check in.',
          v_remaining,
          case when v_remaining = 1 then '' else 's' end
        )
      );
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_enrollments) as t(value)
  loop
    v_id := nullif(trim(coalesce(v_item->>'id', '')), '');
    if v_id is null then
      v_id := replace(gen_random_uuid()::text, '-', '');
    end if;
    v_scope := coalesce(nullif(trim(v_item->>'scope'), ''), 'one');
    if v_scope not in ('one', 'group', 'guide') then
      v_scope := 'one';
    end if;
    v_seats := greatest(1, coalesce(nullif(v_item->>'seats', '')::int, 1));

    insert into public.check_in_enrollments (
      id, date, program, booking_code,
      first_name, last_name, nationality, birthday, passport_number,
      scope, seats, checked_in_at
    ) values (
      v_id,
      p_date,
      p_program,
      trim(p_booking_code),
      trim(coalesce(v_item->>'first_name', v_item->>'firstName', '')),
      trim(coalesce(v_item->>'last_name', v_item->>'lastName', '')),
      trim(coalesce(v_item->>'nationality', '')),
      trim(coalesce(v_item->>'birthday', '')),
      trim(coalesce(v_item->>'passport_number', v_item->>'passportNumber', '')),
      v_scope,
      v_seats,
      coalesce(
        nullif(v_item->>'checked_in_at', '')::timestamptz,
        nullif(v_item->>'checkedInAt', '')::timestamptz,
        timezone('utc', now())
      )
    )
    on conflict (id) do nothing;
  end loop;

  if v_new_guest_seats > 0
     and (v_existing_guest_seats + v_new_guest_seats) >= v_seat_total then
    insert into public.check_in_attendance (date, program, booking_code, status)
    values (p_date, p_program, trim(p_booking_code), 'checked')
    on conflict (date, program, booking_code)
    do update set status = excluded.status
    where public.check_in_attendance.status is distinct from 'no-show';
    v_fully := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'count', jsonb_array_length(p_enrollments),
    'fully_checked', v_fully
  );
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$function$;

revoke all on function public.portal_record_check_in_enrollments(date, text, text, jsonb) from public, anon;
grant execute on function public.portal_record_check_in_enrollments(date, text, text, jsonb) to authenticated, service_role;
