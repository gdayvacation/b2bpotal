-- Agent company profile shown on that agent's vouchers.
-- Safe to re-run.
-- Partners may update only their own row, and only these columns.
-- Guests and day helpers may read the profile for a booking they can already see.

alter table public.agents
  add column if not exists company_name text not null default '';

alter table public.agents
  add column if not exists company_phone text not null default '';

alter table public.agents
  add column if not exists company_email text not null default '';

alter table public.agents
  add column if not exists logo_data_url text not null default '';

alter table public.agents drop constraint if exists agents_company_name_len;
alter table public.agents drop constraint if exists agents_company_phone_shape;
alter table public.agents drop constraint if exists agents_company_email_shape;
alter table public.agents drop constraint if exists agents_logo_shape;

alter table public.agents
  add constraint agents_company_name_len check (char_length(company_name) <= 120);

alter table public.agents
  add constraint agents_company_phone_shape check (
    company_phone = ''
    or company_phone ~ '^[0-9+().[:space:]-]{1,40}$'
  );

alter table public.agents
  add constraint agents_company_email_shape check (
    company_email = ''
    or (
      char_length(company_email) <= 120
      and company_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  );

alter table public.agents
  add constraint agents_logo_shape check (
    logo_data_url = ''
    or (
      char_length(logo_data_url) <= 160000
      and logo_data_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
    )
  );

create or replace function public.update_own_agent_company(
  p_company_name text,
  p_company_phone text,
  p_company_email text,
  p_logo_data_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := public.jwt_agent_slug();
  v_name text := regexp_replace(trim(coalesce(p_company_name, '')), '\s+', ' ', 'g');
  v_phone text := trim(coalesce(p_company_phone, ''));
  v_email text := lower(trim(coalesce(p_company_email, '')));
  v_logo text := trim(coalesce(p_logo_data_url, ''));
begin
  if public.jwt_role() is distinct from 'partner' or v_slug is null or v_slug = '' then
    raise exception 'not allowed';
  end if;
  if v_name = '' or char_length(v_name) > 120 then
    raise exception 'Enter a company name up to 120 characters.';
  end if;
  if char_length(v_phone) > 40 or v_phone ~ '[^0-9+().[:space:]-]' then
    raise exception 'Phone can only use numbers, spaces, and + - ( ).';
  end if;
  if v_email <> '' and (
    char_length(v_email) > 120
    or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'Enter a valid email.';
  end if;
  if v_logo <> '' and (
    char_length(v_logo) > 160000
    or v_logo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'
  ) then
    raise exception 'Logo must be a small PNG, JPG, or WebP.';
  end if;

  update public.agents
  set
    company_name = v_name,
    company_phone = v_phone,
    company_email = v_email,
    logo_data_url = v_logo
  where slug = v_slug;

  if not found then
    raise exception 'Agent not found.';
  end if;
end;
$$;

revoke all on function public.update_own_agent_company(text, text, text, text) from public, anon;
grant execute on function public.update_own_agent_company(text, text, text, text) to authenticated;

drop policy if exists agents_guest_company_select on public.agents;
create policy agents_guest_company_select on public.agents
  for select to authenticated
  using (
    (select public.jwt_role()) = 'guest'
    and exists (
      select 1
      from public.bookings b
      where b.agent_slug = agents.slug
        and b.code = (select public.jwt_booking_code())
    )
  );

drop policy if exists agents_helper_company_select on public.agents;
create policy agents_helper_company_select on public.agents
  for select to authenticated
  using (
    (select public.jwt_role()) = 'helper'
    and exists (
      select 1
      from public.bookings b
      where b.agent_slug = agents.slug
        and b.date = (
          select case
            when raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raw::date
            else null
          end
          from (select public.jwt_helper_date() as raw) helper_day
        )
    )
  );
