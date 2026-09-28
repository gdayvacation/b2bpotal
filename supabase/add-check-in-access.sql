-- Scope marina QR access. Safe to re-run.
-- Guest QR (?b=code) sees that booking only.
-- Helper QR sees that day's operational bookings only.
-- Anon can no longer dump bookings / check-in PII.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- JWT claims
-- -----------------------------------------------------------------------------
create or replace function public.jwt_booking_code()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select nullif(trim(coalesce(auth.jwt()->'app_metadata'->>'booking_code', '')), '');
$$;

create or replace function public.jwt_booking_date()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select nullif(trim(coalesce(auth.jwt()->'app_metadata'->>'booking_date', '')), '');
$$;

create or replace function public.jwt_helper_date()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select nullif(trim(coalesce(auth.jwt()->'app_metadata'->>'helper_date', '')), '');
$$;

revoke all on function public.jwt_booking_code() from public;
revoke all on function public.jwt_booking_date() from public;
revoke all on function public.jwt_helper_date() from public;
grant execute on function public.jwt_booking_code() to anon, authenticated;
grant execute on function public.jwt_booking_date() to anon, authenticated;
grant execute on function public.jwt_helper_date() to anon, authenticated;

create or replace function public.jwt_payment_seat_for_guest(p_seat_key text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.jwt_role() = 'guest'
    and public.jwt_booking_code() is not null
    and (
      p_seat_key = public.jwt_booking_code()
      or p_seat_key like public.jwt_booking_code() || ':%'
    );
$$;

revoke all on function public.jwt_payment_seat_for_guest(text) from public;
grant execute on function public.jwt_payment_seat_for_guest(text) to anon, authenticated;

create or replace function public.jwt_payment_seat_for_partner(p_seat_key text)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    public.jwt_role() = 'partner'
    and public.jwt_agent_slug() is not null
    and exists (
      select 1
      from public.bookings b
      where b.agent_slug = public.jwt_agent_slug()
        and (
          p_seat_key = b.code
          or p_seat_key like b.code || ':%'
        )
    );
$$;

revoke all on function public.jwt_payment_seat_for_partner(text) from public;
grant execute on function public.jwt_payment_seat_for_partner(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Helper day keys + guest booking keys
-- -----------------------------------------------------------------------------
create table if not exists private.helper_day_keys (
  tour_date date primary key,
  access_key text not null unique,
  open_time text not null default '00:00',
  close_time text not null default '11:00',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists private.guest_booking_keys (
  booking_code text primary key,
  access_key text not null unique,
  updated_at timestamptz not null default timezone('utc', now())
);

revoke all on table private.helper_day_keys from public, anon, authenticated;
revoke all on table private.guest_booking_keys from public, anon, authenticated;
alter table private.helper_day_keys enable row level security;
alter table private.guest_booking_keys enable row level security;

create or replace function private.helper_auth_email(p_date date)
returns text
language sql
immutable
set search_path = private, pg_temp
as $$
  select 'h-' || p_date::text || '@helper.internal.gday';
$$;

create or replace function private.guest_auth_email(p_code text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'g-' || md5(p_code) || '@guest.internal.gday';
$$;

create or replace function private.ensure_guest_access_key(p_code text)
returns text
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_key text;
begin
  select access_key into v_key
  from private.guest_booking_keys
  where booking_code = p_code;

  if v_key is null then
    v_key := private.new_access_key();
    insert into private.guest_booking_keys (booking_code, access_key)
    values (p_code, v_key)
    on conflict (booking_code) do update
      set access_key = excluded.access_key,
          updated_at = timezone('utc', now())
      returning access_key into v_key;
  end if;

  return v_key;
end;
$$;

create or replace function private.helper_board_state(p_date date, p_open text, p_close text)
returns text
language plpgsql
stable
set search_path = private, pg_temp
as $$
declare
  v_now timestamp;
  v_today date;
  v_minutes int;
  v_open int;
  v_close int;
begin
  v_now := timezone('Asia/Bangkok', now());
  v_today := v_now::date;
  v_minutes := (extract(hour from v_now)::int * 60) + extract(minute from v_now)::int;
  v_open := (split_part(p_open, ':', 1)::int * 60) + split_part(p_open, ':', 2)::int;
  v_close := (split_part(p_close, ':', 1)::int * 60) + split_part(p_close, ':', 2)::int;

  if v_today > p_date then
    return 'closed';
  end if;
  if v_today < p_date then
    return 'too_early';
  end if;
  if v_minutes < v_open then
    return 'too_early';
  end if;
  if v_minutes >= v_close then
    return 'closed';
  end if;
  return 'ok';
end;
$$;

create or replace function public.portal_admin_issue_helper_key(
  p_date date,
  p_open text default '00:00',
  p_close text default '11:00'
)
returns table (
  tour_date date,
  access_key text,
  open_time text,
  close_time text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_open text := coalesce(nullif(trim(p_open), ''), '00:00');
  v_close text := coalesce(nullif(trim(p_close), ''), '11:00');
  v_key text;
begin
  perform private.require_admin();
  if p_date is null then
    raise exception 'Helper date is required.';
  end if;
  if v_open !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_close !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Helper hours are not valid.';
  end if;
  if v_close <= v_open then
    raise exception 'Close QR must be later than Open QR.';
  end if;

  select k.access_key into v_key
  from private.helper_day_keys k
  where k.tour_date = p_date;

  if v_key is null then
    v_key := private.new_access_key();
  end if;

  insert into private.helper_day_keys (tour_date, access_key, open_time, close_time, updated_at)
  values (p_date, v_key, v_open, v_close, timezone('utc', now()))
  on conflict (tour_date) do update
    set access_key = excluded.access_key,
        open_time = excluded.open_time,
        close_time = excluded.close_time,
        updated_at = excluded.updated_at;

  tour_date := p_date;
  access_key := v_key;
  open_time := v_open;
  close_time := v_close;
  return next;
end;
$$;

create or replace function public.portal_helper_enter(p_date date, p_key text)
returns table (
  tour_date date,
  auth_email text,
  open_time text,
  close_time text,
  board_state text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_key text := trim(coalesce(p_key, ''));
  v_row private.helper_day_keys%rowtype;
  v_state text;
begin
  if p_date is null or v_key = '' then
    raise exception 'This helper QR is not valid.';
  end if;

  select * into v_row
  from private.helper_day_keys
  where tour_date = p_date;

  if v_row.tour_date is null or v_row.access_key is distinct from v_key then
    raise exception 'This helper QR is not valid.';
  end if;

  v_state := private.helper_board_state(v_row.tour_date, v_row.open_time, v_row.close_time);
  tour_date := v_row.tour_date;
  open_time := v_row.open_time;
  close_time := v_row.close_time;
  board_state := v_state;

  if v_state is distinct from 'ok' then
    auth_email := null;
    return next;
    return;
  end if;

  perform private.upsert_email_auth_user(
    private.helper_auth_email(v_row.tour_date),
    v_row.access_key,
    jsonb_build_object('role', 'helper', 'helper_date', v_row.tour_date::text)
  );

  auth_email := private.helper_auth_email(v_row.tour_date);
  return next;
end;
$$;

create or replace function public.portal_guest_enter(p_code text)
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
  v_booking public.bookings%rowtype;
  v_key text;
begin
  if v_code = '' then
    raise exception 'This check-in QR is not valid.';
  end if;

  select * into v_booking from public.bookings where code = v_code;
  if v_booking.code is null then
    raise exception 'This check-in QR is not valid.';
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

revoke all on function public.portal_admin_issue_helper_key(date, text, text) from public, anon;
revoke all on function public.portal_helper_enter(date, text) from public;
revoke all on function public.portal_guest_enter(text) from public;
grant execute on function public.portal_admin_issue_helper_key(date, text, text) to authenticated;
grant execute on function public.portal_helper_enter(date, text) to anon, authenticated;
grant execute on function public.portal_guest_enter(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Close anon on PII. Scope helper / guest / partner.
-- -----------------------------------------------------------------------------
do $$
declare
  pii text[] := array[
    'booking_events',
    'check_in_enrollments', 'check_in_attendance', 'check_in_payments',
    'check_in_services', 'check_in_sequences', 'check_in_guest_edits',
    'check_in_notes', 'check_in_booked_pax', 'check_in_arrived_pax',
    'pickup_no_shows', 'own_arrivals', 'job_order_actions'
  ];
  t text;
  has_booking boolean;
  has_date boolean;
begin
  foreach t in array pii
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_partner_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_partner_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_helper_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_guest_all', t);

    execute format(
      'create policy %I on public.%I for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff())',
      t || '_staff_all',
      t
    );

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'booking_code'
    ) into has_booking;
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'date'
    ) into has_date;

    if t = 'check_in_payments' then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.jwt_payment_seat_for_partner(seat_key))',
        t || '_partner_select',
        t
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.jwt_role() = ''helper'' and date::text = public.jwt_helper_date()) with check (public.jwt_role() = ''helper'' and date::text = public.jwt_helper_date())',
        t || '_helper_all',
        t
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.jwt_payment_seat_for_guest(seat_key)) with check (public.jwt_payment_seat_for_guest(seat_key))',
        t || '_guest_all',
        t
      );
      continue;
    end if;

    if has_booking then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.jwt_role() = ''partner'' and exists (select 1 from public.bookings b where b.code = booking_code and b.agent_slug = public.jwt_agent_slug()))',
        t || '_partner_select',
        t
      );
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.jwt_role() = ''guest'' and booking_code = public.jwt_booking_code()) with check (public.jwt_role() = ''guest'' and booking_code = public.jwt_booking_code())',
        t || '_guest_all',
        t
      );
    end if;

    if has_date then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.jwt_role() = ''helper'' and date::text = public.jwt_helper_date()) with check (public.jwt_role() = ''helper'' and date::text = public.jwt_helper_date())',
        t || '_helper_all',
        t
      );
    elsif has_booking then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.jwt_role() = ''helper'' and exists (select 1 from public.bookings b where b.code = booking_code and b.date::text = public.jwt_helper_date())) with check (public.jwt_role() = ''helper'' and exists (select 1 from public.bookings b where b.code = booking_code and b.date::text = public.jwt_helper_date()))',
        t || '_helper_all',
        t
      );
    end if;
  end loop;
end $$;

-- Program-wide sequence row uses booking_code = '*'. Guests may read it for their date.
drop policy if exists check_in_sequences_guest_star_select on public.check_in_sequences;
create policy check_in_sequences_guest_star_select on public.check_in_sequences
  for select to authenticated
  using (
    public.jwt_role() = 'guest'
    and booking_code = '*'
    and date::text = public.jwt_booking_date()
  );

drop policy if exists bookings_anon_all on public.bookings;
drop policy if exists bookings_guest_select on public.bookings;
drop policy if exists bookings_helper_all on public.bookings;

create policy bookings_guest_select on public.bookings
  for select to authenticated
  using (public.jwt_role() = 'guest' and code = public.jwt_booking_code());

create policy bookings_helper_all on public.bookings
  for all to authenticated
  using (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date())
  with check (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date());

drop policy if exists booking_events_partner_select on public.booking_events;
drop policy if exists booking_events_partner_all on public.booking_events;
create policy booking_events_partner_all on public.booking_events
  for all to authenticated
  using (
    public.jwt_role() = 'partner'
    and exists (
      select 1 from public.bookings b
      where b.code = booking_code
        and b.agent_slug = public.jwt_agent_slug()
    )
  )
  with check (
    public.jwt_role() = 'partner'
    and exists (
      select 1 from public.bookings b
      where b.code = booking_code
        and b.agent_slug = public.jwt_agent_slug()
    )
  );

-- Helper / guest still need lookup tables after they become authenticated.
do $$
declare
  lookup text[] := array[
    'agents', 'pickup_zones', 'hotels', 'fleet_vans', 'drivers', 'booking_cutoffs'
  ];
  dated text[] := array[
    'availability', 'day_boat_plans', 'boat_assignments',
    'day_vehicle_plans', 'van_meta', 'van_assignments', 'booking_closures'
  ];
  t text;
begin
  foreach t in array lookup
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_helper_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_guest_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.jwt_role() = ''helper'')',
      t || '_helper_select',
      t
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.jwt_role() = ''guest'')',
      t || '_guest_select',
      t
    );
  end loop;

  foreach t in array dated
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_helper_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_guest_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.jwt_role() = ''helper'' and date::text = public.jwt_helper_date()) with check (public.jwt_role() = ''helper'' and date::text = public.jwt_helper_date())',
      t || '_helper_all',
      t
    );
    if t in ('boat_assignments', 'van_assignments') then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.jwt_role() = ''guest'' and booking_code = public.jwt_booking_code())',
        t || '_guest_select',
        t
      );
    else
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.jwt_role() = ''guest'' and date::text = public.jwt_booking_date())',
        t || '_guest_select',
        t
      );
    end if;
  end loop;
end $$;
