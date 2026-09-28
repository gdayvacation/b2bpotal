-- Admin/accounting can create a login with User ID + password and no email.
-- Safe to re-run.

alter table public.portal_users
  alter column email drop not null;

drop index if exists portal_users_email_lower_uidx;
create unique index if not exists portal_users_email_lower_uidx
  on public.portal_users (lower(trim(email)))
  where email is not null and length(trim(email)) > 0;

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
