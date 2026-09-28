-- Private booking links for agents. Safe to re-run.
-- Keys live in private schema so the public agents table cannot leak them.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.new_access_key()
returns text
language sql
volatile
set search_path = private, extensions, pg_temp
as $$
  select rtrim(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=');
$$;

create table if not exists private.agent_access_keys (
  agent_slug text primary key references public.agents (slug) on update cascade on delete cascade,
  access_key text not null unique,
  updated_at timestamptz not null default timezone('utc', now())
);

revoke all on table private.agent_access_keys from public, anon, authenticated;
alter table private.agent_access_keys enable row level security;

create or replace function private.ensure_agent_access_key(p_slug text)
returns text
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_key text;
begin
  select access_key into v_key
  from private.agent_access_keys
  where agent_slug = p_slug;

  if v_key is null then
    v_key := private.new_access_key();
    insert into private.agent_access_keys (agent_slug, access_key)
    values (p_slug, v_key)
    on conflict (agent_slug) do update
      set access_key = excluded.access_key,
          updated_at = timezone('utc', now())
      returning access_key into v_key;
  end if;

  return v_key;
end;
$$;

create or replace function private.rotate_agent_access_key(p_slug text)
returns text
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_key text := private.new_access_key();
begin
  insert into private.agent_access_keys (agent_slug, access_key, updated_at)
  values (p_slug, v_key, timezone('utc', now()))
  on conflict (agent_slug) do update
    set access_key = excluded.access_key,
        updated_at = excluded.updated_at;
  return v_key;
end;
$$;

create or replace function private.agent_auth_email(p_slug text)
returns text
language sql
immutable
set search_path = private, pg_temp
as $$
  select 'a-' || lower(trim(p_slug)) || '@agents.internal.gday';
$$;

create or replace function private.agents_after_insert()
returns trigger
language plpgsql
security definer
set search_path = private, pg_temp
as $$
begin
  perform private.ensure_agent_access_key(new.slug);
  return new;
end;
$$;

drop trigger if exists agents_ensure_access_key on public.agents;
create trigger agents_ensure_access_key
after insert on public.agents
for each row execute function private.agents_after_insert();

insert into private.agent_access_keys (agent_slug, access_key)
select a.slug, private.new_access_key()
from public.agents a
where not exists (
  select 1 from private.agent_access_keys k where k.agent_slug = a.slug
);

create or replace function public.portal_agent_enter(p_slug text, p_key text)
returns table (
  slug text,
  name text,
  auth_email text
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_key text := trim(coalesce(p_key, ''));
  v_agent public.agents%rowtype;
  v_stored text;
begin
  if v_slug = '' or v_key = '' then
    raise exception 'This booking link is not valid.';
  end if;

  select a.* into v_agent from public.agents a where a.slug = v_slug;
  select k.access_key into v_stored
  from private.agent_access_keys k
  where k.agent_slug = v_slug;

  if v_agent.slug is null or v_stored is null or v_stored is distinct from v_key then
    raise exception 'This booking link is not valid.';
  end if;
  if v_agent.status is distinct from 'Active' then
    raise exception 'This agent is inactive.';
  end if;

  perform private.upsert_email_auth_user(
    private.agent_auth_email(v_slug),
    v_key,
    jsonb_build_object('role', 'partner', 'agent_slug', v_slug)
  );

  slug := v_agent.slug;
  name := v_agent.name;
  auth_email := private.agent_auth_email(v_slug);
  return next;
end;
$$;

create or replace function public.portal_admin_list_agent_keys()
returns table (
  slug text,
  access_key text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.require_admin();
  return query
  select a.slug, k.access_key, k.updated_at
  from public.agents a
  left join private.agent_access_keys k on k.agent_slug = a.slug
  order by a.name;
end;
$$;

create or replace function public.portal_admin_rotate_agent_key(p_slug text)
returns text
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_key text;
begin
  perform private.require_admin();
  if not exists (select 1 from public.agents where slug = v_slug) then
    raise exception 'Agent not found.';
  end if;
  v_key := private.rotate_agent_access_key(v_slug);
  perform private.upsert_email_auth_user(
    private.agent_auth_email(v_slug),
    v_key,
    jsonb_build_object('role', 'partner', 'agent_slug', v_slug)
  );
  return v_key;
end;
$$;

revoke all on function public.portal_agent_enter(text, text) from public;
revoke all on function public.portal_admin_list_agent_keys() from public, anon;
revoke all on function public.portal_admin_rotate_agent_key(text) from public, anon;
grant execute on function public.portal_agent_enter(text, text) to anon, authenticated;
grant execute on function public.portal_admin_list_agent_keys() to authenticated;
grant execute on function public.portal_admin_rotate_agent_key(text) to authenticated;
