-- Guest check-in QR carries an unguessable token (?b=code&t=token).
-- Booking codes are sequential, so the code alone must not unlock a booking.
-- Safe to re-run.
--
-- Rollout: tokenless links keep working while
-- private.portal_flags.guest_qr_require_token = false. After the app that
-- issues tokens is deployed, enforce with:
--   update private.portal_flags set enabled = true where key = 'guest_qr_require_token';

alter table private.guest_booking_keys add column if not exists link_token text;
update private.guest_booking_keys
  set link_token = private.new_access_key()
  where link_token is null;
create unique index if not exists guest_booking_keys_link_token_key
  on private.guest_booking_keys (link_token);

create table if not exists private.portal_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);
revoke all on table private.portal_flags from public, anon, authenticated;
alter table private.portal_flags enable row level security;
insert into private.portal_flags (key, enabled)
  values ('guest_qr_require_token', false)
  on conflict (key) do nothing;

create or replace function private.ensure_guest_link_token(p_code text)
returns text
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_token text;
begin
  perform private.ensure_guest_access_key(p_code);

  select link_token into v_token
  from private.guest_booking_keys
  where booking_code = p_code;

  if v_token is null then
    v_token := private.new_access_key();
    update private.guest_booking_keys
      set link_token = v_token
      where booking_code = p_code;
  end if;

  return v_token;
end;
$$;

revoke all on function private.ensure_guest_link_token(text) from public, anon, authenticated;

-- Staff, or the helper on duty for that booking's date, may issue the guest QR.
create or replace function public.portal_guest_qr_token(p_code text)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_code text := trim(coalesce(p_code, ''));
  v_booking public.bookings%rowtype;
begin
  if v_code = '' then
    raise exception 'Booking code is required.';
  end if;

  select * into v_booking from public.bookings where code = v_code;
  if v_booking.code is null then
    raise exception 'Booking not found.';
  end if;

  if not (
    auth.role() = 'service_role'
    or public.jwt_is_staff()
    or (public.jwt_role() = 'helper' and v_booking.date::text = public.jwt_helper_date())
  ) then
    raise exception 'Not authorized.';
  end if;

  return private.ensure_guest_link_token(v_code);
end;
$$;

revoke all on function public.portal_guest_qr_token(text) from public, anon;
grant execute on function public.portal_guest_qr_token(text) to authenticated;

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

-- Legacy signature (app versions that do not send a token).
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
