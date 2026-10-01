-- Limit concurrent staff PIN logins per role (kicks oldest device).
-- Safe to re-run. Requires pgcrypto.

create extension if not exists pgcrypto;

create table if not exists public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('admin', 'accounting')),
  token_hash text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now())
);

create index if not exists staff_sessions_role_created_idx
  on public.staff_sessions (role, created_at);

alter table public.staff_sessions enable row level security;

create or replace function public.staff_session_open(p_max int, p_idle_days int default 2)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_role text := public.jwt_role();
  v_max int := greatest(1, least(coalesce(p_max, 1), 10));
  v_idle int := greatest(1, least(coalesce(p_idle_days, 2), 30));
  v_id uuid := gen_random_uuid();
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
  v_extra int;
begin
  if v_role is distinct from 'admin' and v_role is distinct from 'accounting' then
    raise exception 'Staff session required';
  end if;

  delete from public.staff_sessions
  where role = v_role
    and last_seen_at < timezone('utc', now()) - make_interval(days => v_idle);

  insert into public.staff_sessions (id, role, token_hash)
  values (v_id, v_role, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  select count(*) - v_max into v_extra
  from public.staff_sessions
  where role = v_role;

  if v_extra > 0 then
    delete from public.staff_sessions s
    where s.id in (
      select id from public.staff_sessions
      where role = v_role
      order by created_at asc
      limit v_extra
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'token', v_token,
    'role', v_role,
    'max', v_max,
    'idle_days', v_idle
  );
end;
$$;

create or replace function public.staff_session_open(p_max int)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.staff_session_open(p_max, 2);
$$;

create or replace function public.staff_session_validate(
  p_role text,
  p_id uuid,
  p_token text,
  p_idle_days int default 2
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text := encode(extensions.digest(trim(coalesce(p_token, '')), 'sha256'), 'hex');
  v_idle int := greatest(1, least(coalesce(p_idle_days, 2), 30));
  v_last timestamptz;
  n int;
begin
  if p_role is distinct from 'admin' and p_role is distinct from 'accounting' then
    return false;
  end if;
  if p_id is null or length(trim(coalesce(p_token, ''))) < 16 then
    return false;
  end if;

  select last_seen_at into v_last
  from public.staff_sessions
  where id = p_id
    and role = p_role
    and token_hash = v_hash;

  if v_last is null then
    return false;
  end if;

  if v_last < timezone('utc', now()) - make_interval(days => v_idle) then
    delete from public.staff_sessions
    where id = p_id and token_hash = v_hash;
    return false;
  end if;

  update public.staff_sessions
  set last_seen_at = timezone('utc', now())
  where id = p_id
    and role = p_role
    and token_hash = v_hash;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.staff_session_validate(
  p_role text,
  p_id uuid,
  p_token text
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.staff_session_validate(p_role, p_id, p_token, 2);
$$;

create or replace function public.staff_session_close(
  p_id uuid,
  p_token text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_hash text := encode(extensions.digest(trim(coalesce(p_token, '')), 'sha256'), 'hex');
  n int;
begin
  delete from public.staff_sessions
  where id = p_id and token_hash = v_hash;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.staff_session_open(int) from public;
revoke all on function public.staff_session_open(int, int) from public;
revoke all on function public.staff_session_validate(text, uuid, text) from public;
revoke all on function public.staff_session_validate(text, uuid, text, int) from public;
revoke all on function public.staff_session_close(uuid, text) from public;
grant execute on function public.staff_session_open(int) to authenticated;
grant execute on function public.staff_session_open(int, int) to authenticated;
grant execute on function public.staff_session_validate(text, uuid, text) to anon, authenticated;
grant execute on function public.staff_session_validate(text, uuid, text, int) to anon, authenticated;
grant execute on function public.staff_session_close(uuid, text) to anon, authenticated;
