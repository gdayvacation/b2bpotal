-- 1) Freeze each booking's ticket-number block once every seat is checked in, so the numbers
--    stay with that booking even when boats / vans / other bookings change afterwards.
-- 2) Cap check-in seats per booking on the server (staff can still add more).
--
-- Run once in the Supabase SQL editor (after add-check-in-sequences.sql and
-- add-guest-ticket-sequence.sql).

-- ---------------------------------------------------------------------------
-- Sequence blocks for one program-day. Frozen rows in check_in_sequences keep their start;
-- everyone else is numbered in van order and skips numbers reserved by frozen blocks.
-- ---------------------------------------------------------------------------
create or replace function private.compute_sequence_blocks(p_date date, p_program text)
returns table (booking_code text, start_number int, seats int)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_program_start int := 1;
  v_cursor int;
  v_start int;
  v_seats int;
  v_override int;
  v_next int;
  r record;
begin
  select s.start_number into v_program_start
  from public.check_in_sequences s
  where s.date = p_date and s.program = p_program and s.booking_code = '*'
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
        greatest(
          1,
          coalesce(b.adults, 0) + coalesce(b.children, 0)
            + coalesce(b.infants, 0) + coalesce(b.tour_leaders, 0)
        ) as seats,
        lower(trim(coalesce(b.pickup_zone, ''))) = 'no transfer' as is_no_transfer
      from public.bookings b
      where b.date = p_date
        and b.program = p_program
        and b.status is distinct from 'Cancelled'
    ),
    primary_van as (
      select
        va.booking_code,
        min(va.van_number) filter (
          where va.van_number is distinct from 97 and va.van_number is distinct from 99
        ) as van_number
      from public.van_assignments va
      where va.date = p_date and va.program = p_program
      group by va.booking_code
    ),
    van_sort as (
      select va.booking_code, va.van_number, min(coalesce(va.sort_order, 0)) as sort_order
      from public.van_assignments va
      where va.date = p_date
        and va.program = p_program
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
        on vs.booking_code = d.code and vs.van_number = pv.van_number
      order by bucket, van_number, sort_order, d.lead_guest, d.code
    )
    select o.code, o.seats from ordered o
  loop
    v_seats := greatest(1, r.seats);

    select s.start_number into v_override
    from public.check_in_sequences s
    where s.date = p_date and s.program = p_program and s.booking_code = r.code
    limit 1;

    if v_override is not null and v_override >= 1 then
      v_start := v_override;
    else
      v_start := v_cursor;
      loop
        -- Move past any frozen block (another active booking) that overlaps this one.
        select max(
          s.start_number + greatest(
            1,
            coalesce(b.adults, 0) + coalesce(b.children, 0)
              + coalesce(b.infants, 0) + coalesce(b.tour_leaders, 0)
          )
        ) into v_next
        from public.check_in_sequences s
        join public.bookings b on b.code = s.booking_code
        where s.date = p_date
          and s.program = p_program
          and s.booking_code <> '*'
          and s.booking_code <> r.code
          and b.status is distinct from 'Cancelled'
          and s.start_number <= v_start + v_seats - 1
          and s.start_number + greatest(
                1,
                coalesce(b.adults, 0) + coalesce(b.children, 0)
                  + coalesce(b.infants, 0) + coalesce(b.tour_leaders, 0)
              ) - 1 >= v_start;
        exit when v_next is null or v_next <= v_start;
        v_start := v_next;
      end loop;
    end if;

    booking_code := r.code;
    start_number := v_start;
    seats := v_seats;
    return next;

    v_cursor := greatest(v_cursor, v_start + v_seats);
  end loop;
end;
$$;

revoke all on function private.compute_sequence_blocks(date, text) from public;

-- ---------------------------------------------------------------------------
-- Guest / helper / staff ticket sequence RPC (same signature as before).
-- ---------------------------------------------------------------------------
create or replace function public.portal_guest_ticket_sequence(p_code text)
returns table (
  booking_code text,
  start_number int,
  end_number int,
  seats int
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_role text := public.jwt_role();
  v_booking public.bookings%rowtype;
  v_block record;
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

  select * into v_block
  from private.compute_sequence_blocks(v_booking.date, v_booking.program) c
  where c.booking_code = v_code;

  if v_block.booking_code is null then
    booking_code := v_code;
    seats := greatest(
      1,
      coalesce(v_booking.adults, 0) + coalesce(v_booking.children, 0)
        + coalesce(v_booking.infants, 0) + coalesce(v_booking.tour_leaders, 0)
    );
    start_number := 1;
    end_number := seats;
    return next;
    return;
  end if;

  booking_code := v_code;
  start_number := v_block.start_number;
  seats := v_block.seats;
  end_number := v_block.start_number + v_block.seats - 1;
  return next;
end;
$$;

revoke all on function public.portal_guest_ticket_sequence(text) from public;
grant execute on function public.portal_guest_ticket_sequence(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Freeze a booking's block once all of its seats are checked in.
-- ---------------------------------------------------------------------------
create or replace function private.freeze_booking_sequence(p_code text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  b public.bookings%rowtype;
  v_seats int;
  v_enrolled int;
  v_start int;
begin
  select * into b from public.bookings where code = p_code;
  if b.code is null or b.status is not distinct from 'Cancelled' then
    return;
  end if;

  if exists (
    select 1 from public.check_in_sequences s
    where s.date = b.date and s.program = b.program and s.booking_code = b.code
  ) then
    return;
  end if;

  v_seats := greatest(
    1,
    coalesce(b.adults, 0) + coalesce(b.children, 0)
      + coalesce(b.infants, 0) + coalesce(b.tour_leaders, 0)
  );
  select coalesce(sum(e.seats), 0) into v_enrolled
  from public.check_in_enrollments e
  where e.date = b.date and e.program = b.program and e.booking_code = b.code
    and e.scope <> 'guide';
  if v_enrolled < v_seats then
    return;
  end if;

  -- One freezer at a time per program-day so two phones can never be given the same numbers.
  perform pg_advisory_xact_lock(hashtext('seq:' || b.date::text || ':' || b.program));

  if exists (
    select 1 from public.check_in_sequences s
    where s.date = b.date and s.program = b.program and s.booking_code = b.code
  ) then
    return;
  end if;

  select c.start_number into v_start
  from private.compute_sequence_blocks(b.date, b.program) c
  where c.booking_code = b.code;

  if v_start is not null and v_start >= 1 and v_start <= 9999 then
    insert into public.check_in_sequences (date, program, booking_code, start_number)
    values (b.date, b.program, b.code, v_start)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function private.freeze_booking_sequence(text) from public;

create or replace function private.check_in_enrollment_after_write()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.freeze_booking_sequence(new.booking_code);
  return null;
end;
$$;

drop trigger if exists check_in_enrollments_freeze_sequence on public.check_in_enrollments;
create trigger check_in_enrollments_freeze_sequence
after insert or update of seats on public.check_in_enrollments
for each row execute function private.check_in_enrollment_after_write();

-- ---------------------------------------------------------------------------
-- Server-side cap: guests / helpers cannot check in more seats than the booking has.
-- Staff (admin) and service role are not limited. Tour group guides are never counted.
-- ---------------------------------------------------------------------------
create or replace function private.check_in_enrollment_cap()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_pax int;
  v_other int;
begin
  if public.jwt_is_staff() or coalesce(auth.role(), 'service_role') = 'service_role' then
    return new;
  end if;
  if new.scope = 'guide' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.seats <= old.seats and new.booking_code = old.booking_code then
    return new;
  end if;

  select greatest(
    1,
    coalesce(b.adults, 0) + coalesce(b.children, 0)
      + coalesce(b.infants, 0) + coalesce(b.tour_leaders, 0)
  ) into v_pax
  from public.bookings b
  where b.code = new.booking_code;
  if v_pax is null then
    return new;
  end if;

  select coalesce(sum(e.seats), 0) into v_other
  from public.check_in_enrollments e
  where e.date = new.date and e.program = new.program and e.booking_code = new.booking_code
    and e.scope <> 'guide'
    and e.id is distinct from new.id;

  if v_other + new.seats > v_pax then
    raise exception 'This booking is already fully checked in. Ask marina staff to add more guests.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists check_in_enrollments_cap on public.check_in_enrollments;
create trigger check_in_enrollments_cap
before insert or update of seats on public.check_in_enrollments
for each row execute function private.check_in_enrollment_cap();

-- ---------------------------------------------------------------------------
-- One-off: freeze bookings from today onward that are already fully checked in.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select distinct e.booking_code
    from public.check_in_enrollments e
    join public.bookings b on b.code = e.booking_code and b.date = e.date
    where e.date >= (timezone('Asia/Bangkok', now()))::date - 1
  loop
    perform private.freeze_booking_sequence(r.booking_code);
  end loop;
end;
$$;
