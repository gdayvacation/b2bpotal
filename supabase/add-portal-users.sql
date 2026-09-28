-- Portal accounts: partners sign up with email; admin sets User ID + password.
-- Run once in Supabase SQL Editor. Safe to re-run.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Users (no passwords in this table)
-- -----------------------------------------------------------------------------
create table if not exists public.portal_users (
  id uuid primary key default gen_random_uuid(),
  email text,
  name text not null default '',
  company text not null default '',
  user_id text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'inactive')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists portal_users_email_lower_uidx
  on public.portal_users (lower(trim(email)))
  where email is not null and length(trim(email)) > 0;

create unique index if not exists portal_users_user_id_lower_uidx
  on public.portal_users (lower(trim(user_id)))
  where user_id is not null and length(trim(user_id)) > 0;

drop trigger if exists portal_users_set_updated_at on public.portal_users;
create trigger portal_users_set_updated_at
before update on public.portal_users
for each row execute function public.set_updated_at();

alter table public.portal_users enable row level security;

drop policy if exists pilot_portal_users_all on public.portal_users;
drop policy if exists portal_users_select on public.portal_users;
drop policy if exists portal_users_insert on public.portal_users;
drop policy if exists portal_users_update on public.portal_users;
drop policy if exists portal_users_delete on public.portal_users;

-- Direct table access is closed. Reads/writes go through the functions below.
revoke all on table public.portal_users from anon, authenticated, public;
grant select, insert, update, delete on table public.portal_users to postgres, service_role;

-- -----------------------------------------------------------------------------
-- Password hashes (not exposed through the Data API)
-- -----------------------------------------------------------------------------
create table if not exists private.portal_user_credentials (
  portal_user_id uuid primary key references public.portal_users (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

revoke all on table private.portal_user_credentials from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function private.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = private, pg_temp
as $$
  select lower(trim(coalesce(p_email, '')));
$$;

create or replace function private.normalize_user_id(p_user_id text)
returns text
language sql
immutable
set search_path = private, pg_temp
as $$
  select nullif(trim(coalesce(p_user_id, '')), '');
$$;

create or replace function private.assert_email(p_email text)
returns text
language plpgsql
immutable
set search_path = private, pg_temp
as $$
declare
  v_email text := private.normalize_email(p_email);
begin
  if v_email = '' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  return v_email;
end;
$$;

create or replace function private.assert_user_id(p_user_id text)
returns text
language plpgsql
immutable
set search_path = private, pg_temp
as $$
declare
  v_user_id text := private.normalize_user_id(p_user_id);
begin
  if v_user_id is null then
    raise exception 'Enter a User ID.';
  end if;
  if v_user_id !~ '^[A-Za-z0-9._-]{3,40}$' then
    raise exception 'User ID must be 3-40 letters, numbers, dots, hyphens, or underscores.';
  end if;
  return v_user_id;
end;
$$;

create or replace function private.assert_password(p_password text)
returns text
language plpgsql
immutable
set search_path = private, pg_temp
as $$
begin
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if octet_length(p_password) > 72 then
    raise exception 'Password is too long.';
  end if;
  return p_password;
end;
$$;

create or replace function private.set_portal_password(p_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  insert into private.portal_user_credentials (portal_user_id, password_hash, updated_at)
  values (p_id, crypt(private.assert_password(p_password), gen_salt('bf', 10)), timezone('utc', now()))
  on conflict (portal_user_id) do update
    set password_hash = excluded.password_hash,
        updated_at = excluded.updated_at;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public RPCs
-- -----------------------------------------------------------------------------
create or replace function public.portal_sign_up(
  p_email text,
  p_name text default '',
  p_company text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.portal_users (email, name, company, status)
  values (
    private.assert_email(p_email),
    trim(coalesce(p_name, '')),
    trim(coalesce(p_company, '')),
    'pending'
  )
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'This email is already registered.';
end;
$$;

create or replace function public.portal_list_users()
returns table (
  id uuid,
  email text,
  name text,
  company text,
  user_id text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  has_password boolean
)
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select
    u.id,
    u.email,
    u.name,
    u.company,
    u.user_id,
    u.status,
    u.created_at,
    u.updated_at,
    (c.portal_user_id is not null) as has_password
  from public.portal_users u
  left join private.portal_user_credentials c on c.portal_user_id = u.id
  order by u.created_at desc;
$$;

create or replace function private.optional_email(p_email text)
returns text
language plpgsql
immutable
set search_path = private, pg_temp
as $$
declare
  v_email text := private.normalize_email(p_email);
begin
  if v_email = '' then
    return null;
  end if;
  return private.assert_email(p_email);
end;
$$;

create or replace function public.portal_admin_create_user(
  p_email text,
  p_name text default '',
  p_company text default '',
  p_user_id text default '',
  p_password text default ''
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
  v_has_login boolean := v_user_id is not null or coalesce(p_password, '') <> '';
begin
  if v_has_login then
    v_user_id := private.assert_user_id(p_user_id);
    perform private.assert_password(p_password);
  elsif v_email is null then
    raise exception 'Enter a User ID and password.';
  end if;

  insert into public.portal_users (email, name, company, user_id, status)
  values (
    v_email,
    trim(coalesce(p_name, '')),
    trim(coalesce(p_company, '')),
    v_user_id,
    case when v_has_login then 'active' else 'pending' end
  )
  returning id into v_id;

  if v_has_login then
    perform private.set_portal_password(v_id, p_password);
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'That email or User ID is already in use.';
end;
$$;

create or replace function public.portal_admin_set_credentials(
  p_id uuid,
  p_user_id text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_user_id text := private.assert_user_id(p_user_id);
begin
  if not exists (select 1 from public.portal_users where id = p_id) then
    raise exception 'User not found.';
  end if;

  update public.portal_users
  set user_id = v_user_id,
      status = 'active'
  where id = p_id;

  perform private.set_portal_password(p_id, p_password);
exception
  when unique_violation then
    raise exception 'That User ID is already in use.';
end;
$$;

create or replace function public.portal_admin_set_status(
  p_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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
set search_path = public, pg_temp
as $$
begin
  delete from public.portal_users where id = p_id;
end;
$$;

create or replace function public.portal_sign_in(
  p_user_id text,
  p_password text
)
returns table (
  id uuid,
  email text,
  name text,
  company text,
  user_id text,
  status text
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

  id := v_row.id;
  email := v_row.email;
  name := v_row.name;
  company := v_row.company;
  user_id := v_row.user_id;
  status := v_row.status;
  return next;
end;
$$;

revoke all on function public.portal_sign_up(text, text, text) from public;
revoke all on function public.portal_list_users() from public;
revoke all on function public.portal_admin_create_user(text, text, text, text, text) from public;
revoke all on function public.portal_admin_set_credentials(uuid, text, text) from public;
revoke all on function public.portal_admin_set_status(uuid, text) from public;
revoke all on function public.portal_admin_delete_user(uuid) from public;
revoke all on function public.portal_sign_in(text, text) from public;

grant execute on function public.portal_sign_up(text, text, text) to anon, authenticated;
grant execute on function public.portal_list_users() to anon, authenticated;
grant execute on function public.portal_admin_create_user(text, text, text, text, text) to anon, authenticated;
grant execute on function public.portal_admin_set_credentials(uuid, text, text) to anon, authenticated;
grant execute on function public.portal_admin_set_status(uuid, text) to anon, authenticated;
grant execute on function public.portal_admin_delete_user(uuid) to anon, authenticated;
grant execute on function public.portal_sign_in(text, text) to anon, authenticated;

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
