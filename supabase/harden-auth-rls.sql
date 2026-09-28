-- Harden portal auth + RLS.
-- Safe to re-run. Does not drop booking / check-in / agent data.
-- Lookup tables stay anon. Bookings and check-in PII are scoped in add-check-in-access.sql.
-- Logged-in partners are isolated to their agent_slug.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Portal user <-> agent + auth mapping
-- -----------------------------------------------------------------------------
alter table public.portal_users
  add column if not exists agent_slug text;

alter table public.portal_users
  add column if not exists auth_user_id uuid;

create unique index if not exists portal_users_auth_user_id_uidx
  on public.portal_users (auth_user_id)
  where auth_user_id is not null;

alter table private.portal_user_credentials enable row level security;

-- -----------------------------------------------------------------------------
-- JWT helpers (invoker; only reads the caller's token)
-- -----------------------------------------------------------------------------
create or replace function public.jwt_role()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select lower(trim(coalesce(auth.jwt()->'app_metadata'->>'role', '')));
$$;

create or replace function public.jwt_agent_slug()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select lower(trim(coalesce(auth.jwt()->'app_metadata'->>'agent_slug', '')));
$$;

create or replace function public.jwt_is_staff()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select public.jwt_role() in ('admin', 'accounting');
$$;

revoke all on function public.jwt_role() from public;
revoke all on function public.jwt_agent_slug() from public;
revoke all on function public.jwt_is_staff() from public;
grant execute on function public.jwt_role() to anon, authenticated;
grant execute on function public.jwt_agent_slug() to anon, authenticated;
grant execute on function public.jwt_is_staff() to anon, authenticated;

create or replace function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = private, public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then
    return;
  end if;
  if public.jwt_role() is distinct from 'admin' then
    raise exception 'Not authorized.';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Sync a portal user into auth.users so the browser can hold a real JWT
-- -----------------------------------------------------------------------------
create or replace function private.upsert_email_auth_user(
  p_email text,
  p_password text,
  p_app_metadata jsonb,
  p_existing_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = auth, extensions, private, pg_temp
as $$
declare
  v_id uuid := p_existing_id;
  v_email text := lower(trim(p_email));
  v_meta jsonb := coalesce(p_app_metadata, '{}'::jsonb)
    || jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'));
begin
  if v_email is null or v_email = '' then
    raise exception 'Auth email is required.';
  end if;
  perform private.assert_password(p_password);

  if v_id is null then
    select u.id into v_id
    from auth.users u
    where lower(u.email) = v_email
    limit 1;
  end if;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')),
      timezone('utc', now()),
      v_meta,
      '{}'::jsonb,
      timezone('utc', now()),
      timezone('utc', now()),
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
    set email = v_email,
        encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, timezone('utc', now())),
        raw_app_meta_data = v_meta,
        updated_at = timezone('utc', now())
    where id = v_id;
  end if;

  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email),
    'email',
    v_email,
    timezone('utc', now()),
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (provider_id, provider) do update
    set user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        updated_at = timezone('utc', now());

  return v_id;
end;
$$;

create or replace function private.portal_auth_email(p_id uuid)
returns text
language sql
immutable
set search_path = private, pg_temp
as $$
  select 'u-' || replace(p_id::text, '-', '') || '@users.internal.gday';
$$;

create or replace function private.sync_portal_auth_user(p_id uuid, p_password text)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_row public.portal_users%rowtype;
  v_auth_id uuid;
begin
  select * into v_row from public.portal_users where id = p_id;
  if v_row.id is null then
    raise exception 'User not found.';
  end if;

  v_auth_id := private.upsert_email_auth_user(
    private.portal_auth_email(v_row.id),
    p_password,
    jsonb_build_object(
      'role', 'partner',
      'agent_slug', coalesce(v_row.agent_slug, ''),
      'portal_user_id', v_row.id::text
    ),
    v_row.auth_user_id
  );

  update public.portal_users
  set auth_user_id = v_auth_id
  where id = v_row.id;

  return v_auth_id;
end;
$$;

create or replace function private.normalize_agent_slug(p_slug text)
returns text
language sql
immutable
set search_path = private, pg_temp
as $$
  select nullif(lower(trim(coalesce(p_slug, ''))), '');
$$;

-- -----------------------------------------------------------------------------
-- Admin / sign-in RPCs
-- -----------------------------------------------------------------------------
drop function if exists public.portal_list_users();
create function public.portal_list_users()
returns table (
  id uuid,
  email text,
  name text,
  company text,
  user_id text,
  agent_slug text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  has_password boolean
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  return query
  select
    u.id,
    u.email,
    u.name,
    u.company,
    u.user_id,
    u.agent_slug,
    u.status,
    u.created_at,
    u.updated_at,
    (c.portal_user_id is not null) as has_password
  from public.portal_users u
  left join private.portal_user_credentials c on c.portal_user_id = u.id
  order by u.created_at desc;
end;
$$;

drop function if exists public.portal_admin_create_user(text, text, text, text, text);
drop function if exists public.portal_admin_create_user(text, text, text, text, text, text);
create function public.portal_admin_create_user(
  p_email text,
  p_name text default '',
  p_company text default '',
  p_user_id text default '',
  p_password text default '',
  p_agent_slug text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_id uuid;
  v_email text := private.optional_email(p_email);
  v_user_id text := private.normalize_user_id(p_user_id);
  v_agent text := private.normalize_agent_slug(p_agent_slug);
  v_has_login boolean := v_user_id is not null or coalesce(p_password, '') <> '';
begin
  perform private.require_admin();
  if v_has_login then
    v_user_id := private.assert_user_id(p_user_id);
    perform private.assert_password(p_password);
  elsif v_email is null then
    raise exception 'Enter a User ID and password.';
  end if;

  insert into public.portal_users (email, name, company, user_id, agent_slug, status)
  values (
    v_email,
    trim(coalesce(p_name, '')),
    trim(coalesce(p_company, '')),
    v_user_id,
    v_agent,
    case when v_has_login then 'active' else 'pending' end
  )
  returning id into v_id;

  if v_has_login then
    perform private.set_portal_password(v_id, p_password);
    perform private.sync_portal_auth_user(v_id, p_password);
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'That email or User ID is already in use.';
end;
$$;

drop function if exists public.portal_admin_set_credentials(uuid, text, text);
drop function if exists public.portal_admin_set_credentials(uuid, text, text, text);
create function public.portal_admin_set_credentials(
  p_id uuid,
  p_user_id text,
  p_password text,
  p_agent_slug text default ''
)
returns void
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_user_id text := private.assert_user_id(p_user_id);
  v_agent text := private.normalize_agent_slug(p_agent_slug);
begin
  perform private.require_admin();
  if not exists (select 1 from public.portal_users where id = p_id) then
    raise exception 'User not found.';
  end if;

  update public.portal_users
  set user_id = v_user_id,
      status = 'active',
      agent_slug = case when v_agent is null then agent_slug else v_agent end
  where id = p_id;

  perform private.set_portal_password(p_id, p_password);
  perform private.sync_portal_auth_user(p_id, p_password);
exception
  when unique_violation then
    raise exception 'That User ID is already in use.';
end;
$$;

create or replace function public.portal_admin_set_agent_slug(p_id uuid, p_agent_slug text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_agent text := private.normalize_agent_slug(p_agent_slug);
begin
  perform private.require_admin();
  update public.portal_users
  set agent_slug = v_agent
  where id = p_id;
  if not found then
    raise exception 'User not found.';
  end if;
end;
$$;

create or replace function public.portal_admin_set_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  if p_status not in ('pending', 'active', 'inactive') then
    raise exception 'Invalid status.';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.portal_users where id = p_id and user_id is not null
  ) then
    raise exception 'Set a User ID and password before activating.';
  end if;
  update public.portal_users
  set status = p_status
  where id = p_id;
  if not found then
    raise exception 'User not found.';
  end if;
end;
$$;

create or replace function public.portal_admin_delete_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $$
declare
  v_auth uuid;
begin
  perform private.require_admin();
  select auth_user_id into v_auth from public.portal_users where id = p_id;
  delete from public.portal_users where id = p_id;
  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;
end;
$$;

drop function if exists public.portal_sign_in(text, text);
create function public.portal_sign_in(p_user_id text, p_password text)
returns table (
  id uuid,
  email text,
  name text,
  company text,
  user_id text,
  agent_slug text,
  status text,
  auth_email text
)
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_row public.portal_users%rowtype;
  v_hash text;
begin
  select u.*
  into v_row
  from public.portal_users u
  where lower(trim(u.user_id)) = lower(trim(coalesce(p_user_id, '')))
  limit 1;

  if v_row.id is null then
    raise exception 'User ID or password is incorrect.';
  end if;

  select c.password_hash
  into v_hash
  from private.portal_user_credentials c
  where c.portal_user_id = v_row.id;

  if v_hash is null or v_hash <> crypt(coalesce(p_password, ''), v_hash) then
    raise exception 'User ID or password is incorrect.';
  end if;

  if v_row.status <> 'active' then
    raise exception 'This account is not active yet. Ask Gday admin to set your User ID and password.';
  end if;

  perform private.sync_portal_auth_user(v_row.id, p_password);

  id := v_row.id;
  email := v_row.email;
  name := v_row.name;
  company := v_row.company;
  user_id := v_row.user_id;
  agent_slug := v_row.agent_slug;
  status := v_row.status;
  auth_email := private.portal_auth_email(v_row.id);
  return next;
end;
$$;

revoke execute on function public.portal_list_users() from anon, public;
revoke execute on function public.portal_admin_create_user(text, text, text, text, text, text) from anon, public;
revoke execute on function public.portal_admin_set_credentials(uuid, text, text, text) from anon, public;
revoke execute on function public.portal_admin_set_agent_slug(uuid, text) from anon, public;
revoke execute on function public.portal_admin_set_status(uuid, text) from anon, public;
revoke execute on function public.portal_admin_delete_user(uuid) from anon, public;

grant execute on function public.portal_sign_up(text, text, text) to anon, authenticated;
grant execute on function public.portal_sign_in(text, text) to anon, authenticated;
grant execute on function public.portal_list_users() to authenticated;
grant execute on function public.portal_admin_create_user(text, text, text, text, text, text) to authenticated;
grant execute on function public.portal_admin_set_credentials(uuid, text, text, text) to authenticated;
grant execute on function public.portal_admin_set_agent_slug(uuid, text) to authenticated;
grant execute on function public.portal_admin_set_status(uuid, text) to authenticated;
grant execute on function public.portal_admin_delete_user(uuid) to authenticated;

revoke all on function public.seed_mock_data() from public, anon, authenticated;
grant execute on function public.seed_mock_data() to postgres, service_role;

do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
  loop
    execute format(
      'revoke all on function private.%I(%s) from public, anon, authenticated',
      r.proname,
      r.args
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Replace open authenticated access. Lookup/ops boards stay anon.
-- Bookings + check-in PII are closed to anon in add-check-in-access.sql.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and policyname like 'pilot_%'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

do $$
declare
  ops text[] := array[
    'agents', 'pickup_zones', 'hotels', 'availability',
    'day_boat_plans', 'boat_assignments',
    'day_vehicle_plans', 'van_meta', 'van_assignments', 'fleet_vans', 'drivers',
    'booking_cutoffs', 'booking_closures'
  ];
  pii text[] := array[
    'booking_events',
    'check_in_enrollments', 'check_in_attendance', 'check_in_payments',
    'check_in_services', 'check_in_sequences', 'check_in_guest_edits',
    'check_in_notes', 'check_in_booked_pax', 'check_in_arrived_pax',
    'pickup_no_shows', 'own_arrivals', 'job_order_actions'
  ];
  t text;
begin
  foreach t in array ops
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_partner_select', t);
    execute format(
      'create policy %I on public.%I for all to anon using (true) with check (true)',
      t || '_anon_all',
      t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.jwt_is_staff()) with check (public.jwt_is_staff())',
      t || '_staff_all',
      t
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.jwt_role() = ''partner'')',
      t || '_partner_select',
      t
    );
  end loop;

  foreach t in array pii
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
  end loop;
end $$;

drop policy if exists bookings_anon_all on public.bookings;
drop policy if exists bookings_staff_all on public.bookings;
drop policy if exists bookings_partner_all on public.bookings;
drop policy if exists invoice_settings_staff_all on public.invoice_settings;
drop policy if exists agency_invoice_rates_staff_all on public.agency_invoice_rates;
drop policy if exists agency_invoice_rates_partner_select on public.agency_invoice_rates;
drop policy if exists invoices_staff_all on public.invoices;
drop policy if exists invoices_partner_all on public.invoices;
drop policy if exists invoice_items_staff_all on public.invoice_items;
drop policy if exists invoice_items_partner_all on public.invoice_items;
drop policy if exists partner_invoice_checks_staff_all on public.partner_invoice_checks;

create policy bookings_staff_all on public.bookings
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

create policy bookings_partner_all on public.bookings
  for all to authenticated
  using (public.jwt_role() = 'partner' and agent_slug = public.jwt_agent_slug())
  with check (public.jwt_role() = 'partner' and agent_slug = public.jwt_agent_slug());

-- Billing: closed to anon. Staff full; partner sees own agent only.
create policy invoice_settings_staff_all on public.invoice_settings
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

create policy agency_invoice_rates_staff_all on public.agency_invoice_rates
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

create policy agency_invoice_rates_partner_select on public.agency_invoice_rates
  for select to authenticated
  using (public.jwt_role() = 'partner' and agent_slug = public.jwt_agent_slug());

create policy invoices_staff_all on public.invoices
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

create policy invoices_partner_all on public.invoices
  for all to authenticated
  using (public.jwt_role() = 'partner' and agent_slug = public.jwt_agent_slug())
  with check (public.jwt_role() = 'partner' and agent_slug = public.jwt_agent_slug());

create policy invoice_items_staff_all on public.invoice_items
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

create policy invoice_items_partner_all on public.invoice_items
  for all to authenticated
  using (
    public.jwt_role() = 'partner'
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and i.agent_slug = public.jwt_agent_slug()
    )
  )
  with check (
    public.jwt_role() = 'partner'
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and i.agent_slug = public.jwt_agent_slug()
    )
  );

create policy partner_invoice_checks_staff_all on public.partner_invoice_checks
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());
