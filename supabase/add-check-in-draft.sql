-- Names typed on the guest phone, saved when check-in itself does not go through.
-- Another phone that scans the same QR can load them. Passport data stays in
-- private and is not readable through the Data API.
-- Safe to re-run.

create table if not exists private.check_in_drafts (
  date date not null,
  program text not null,
  booking_code text not null,
  scope text not null,
  guests jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

revoke all on table private.check_in_drafts from public, anon, authenticated;
alter table private.check_in_drafts enable row level security;

create or replace function public.portal_save_check_in_draft(
  p_code text,
  p_token text,
  p_date date,
  p_program text,
  p_scope text,
  p_guests jsonb
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_token text := trim(coalesce(p_token, ''));
  v_booking public.bookings%rowtype;
  v_expected text;
  v_require boolean;
  v_scope text;
  v_clean jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if v_code = '' then
    raise exception 'This check-in QR is not valid.';
  end if;
  if p_program is distinct from 'PP' and p_program is distinct from 'James Bond' then
    raise exception 'Invalid program.';
  end if;
  if p_guests is null
     or jsonb_typeof(p_guests) <> 'array'
     or jsonb_array_length(p_guests) = 0
     or jsonb_array_length(p_guests) > 200 then
    raise exception 'Add at least one guest.';
  end if;

  select * into v_booking
  from public.bookings
  where code = v_code;
  if v_booking.code is null
     or v_booking.status is not distinct from 'Cancelled'
     or v_booking.date is distinct from p_date
     or v_booking.program is distinct from p_program then
    raise exception 'This check-in QR is not valid.';
  end if;

  if not (
    public.jwt_is_staff()
    or (public.jwt_role() = 'helper' and p_date::text = public.jwt_helper_date())
    or (public.jwt_role() = 'guest' and v_code = public.jwt_booking_code())
  ) then
    select coalesce(
      (select f.enabled from private.portal_flags f where f.key = 'guest_qr_require_token'),
      true
    ) into v_require;
    if v_token <> '' or v_require then
      select k.link_token into v_expected
      from private.guest_booking_keys k
      where k.booking_code = v_code;
      if v_expected is null or v_token = '' or v_expected <> v_token then
        raise exception 'This check-in QR is not valid.';
      end if;
    end if;
  end if;

  v_scope := coalesce(nullif(trim(coalesce(p_scope, '')), ''), 'group');
  if v_scope not in ('one', 'group', 'guide') then
    v_scope := 'group';
  end if;

  for v_item in select value from jsonb_array_elements(p_guests) as t(value)
  loop
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'firstName', left(trim(coalesce(v_item->>'firstName', v_item->>'first_name', '')), 80),
      'lastName', left(trim(coalesce(v_item->>'lastName', v_item->>'last_name', '')), 80),
      'nationality', left(trim(coalesce(v_item->>'nationality', '')), 80),
      'birthday', left(trim(coalesce(v_item->>'birthday', '')), 10),
      'passportNumber', left(trim(coalesce(v_item->>'passportNumber', v_item->>'passport_number', '')), 40)
    ));
  end loop;

  insert into private.check_in_drafts (date, program, booking_code, scope, guests, updated_at)
  values (p_date, p_program, v_code, v_scope, v_clean, timezone('utc', now()))
  on conflict (date, program, booking_code)
  do update set
    scope = excluded.scope,
    guests = excluded.guests,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.portal_load_check_in_draft(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_booking public.bookings%rowtype;
  v_row private.check_in_drafts%rowtype;
begin
  if v_code = '' then
    return null;
  end if;

  select * into v_booking from public.bookings where code = v_code;
  if v_booking.code is null then
    return null;
  end if;

  if not (
    public.jwt_is_staff()
    or (public.jwt_role() = 'helper' and v_booking.date::text = public.jwt_helper_date())
    or (public.jwt_role() = 'guest' and v_code = public.jwt_booking_code())
  ) then
    raise exception 'Not allowed.';
  end if;

  select * into v_row
  from private.check_in_drafts
  where booking_code = v_code
    and date = v_booking.date
    and program = v_booking.program;

  if not found then
    return null;
  end if;

  return jsonb_build_object('scope', v_row.scope, 'guests', v_row.guests);
end;
$$;

create or replace function public.portal_clear_check_in_draft(p_code text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_booking public.bookings%rowtype;
begin
  if v_code = '' then
    return;
  end if;

  select * into v_booking from public.bookings where code = v_code;
  if v_booking.code is null then
    return;
  end if;

  if not (
    public.jwt_is_staff()
    or (public.jwt_role() = 'helper' and v_booking.date::text = public.jwt_helper_date())
    or (public.jwt_role() = 'guest' and v_code = public.jwt_booking_code())
  ) then
    raise exception 'Not allowed.';
  end if;

  delete from private.check_in_drafts
  where booking_code = v_code
    and date = v_booking.date
    and program = v_booking.program;
end;
$$;

revoke all on function public.portal_save_check_in_draft(text, text, date, text, text, jsonb) from public;
revoke all on function public.portal_load_check_in_draft(text) from public, anon;
revoke all on function public.portal_clear_check_in_draft(text) from public, anon;

grant execute on function public.portal_save_check_in_draft(text, text, date, text, text, jsonb) to anon, authenticated;
grant execute on function public.portal_load_check_in_draft(text) to authenticated;
grant execute on function public.portal_clear_check_in_draft(text) to authenticated;
