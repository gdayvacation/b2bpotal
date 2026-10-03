-- Guest QR enter closes at 19:00 Asia/Bangkok on the booking's tour date (and any later
-- calendar day). Checked only inside portal_guest_enter — no polling, no cron.
-- Safe to re-run.

create or replace function private.guest_check_in_closed_for_tour_date(p_tour_date date)
returns boolean
language plpgsql
stable
set search_path = public, private, pg_temp
as $$
declare
  v_now timestamp;
  v_today date;
  v_minutes int;
  v_close_minutes int := 19 * 60; -- 19:00 Bangkok
begin
  if p_tour_date is null then
    return true;
  end if;

  v_now := timezone('Asia/Bangkok', now());
  v_today := v_now::date;

  if v_today > p_tour_date then
    return true;
  end if;

  if v_today < p_tour_date then
    return false;
  end if;

  v_minutes := (extract(hour from v_now)::int * 60) + extract(minute from v_now)::int;
  return v_minutes >= v_close_minutes;
end;
$$;

revoke all on function private.guest_check_in_closed_for_tour_date(date) from public, anon, authenticated;

create or replace function public.portal_guest_enter(p_code text, p_token text)
returns table (
  booking_code text,
  auth_email text,
  access_key text
)
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
  v_key text;
begin
  if v_code = '' then
    raise exception 'This check-in QR is not valid.';
  end if;

  select * into v_booking from public.bookings where code = v_code;
  if v_booking.code is null then
    raise exception 'This check-in QR is not valid.';
  end if;

  if private.guest_check_in_closed_for_tour_date(v_booking.date) then
    raise exception 'Check-in is closed for this tour.';
  end if;

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

  v_key := private.ensure_guest_access_key(v_code);
  perform private.upsert_email_auth_user(
    private.guest_auth_email(v_code),
    v_key,
    jsonb_build_object(
      'role', 'guest',
      'booking_code', v_code,
      'booking_date', v_booking.date::text
    )
  );

  booking_code := v_code;
  auth_email := private.guest_auth_email(v_code);
  access_key := v_key;
  return next;
end;
$$;

create or replace function public.portal_guest_enter(p_code text)
returns table (
  booking_code text,
  auth_email text,
  access_key text
)
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select * from public.portal_guest_enter(p_code, null::text);
$$;

revoke all on function public.portal_guest_enter(text, text) from public;
revoke all on function public.portal_guest_enter(text) from public;
grant execute on function public.portal_guest_enter(text, text) to anon, authenticated;
grant execute on function public.portal_guest_enter(text) to anon, authenticated;
