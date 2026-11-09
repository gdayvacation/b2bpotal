-- Helper check-in stays open once admin issues the QR.
-- No open/close clock. The current QR is the latest issued day.
-- Before that day it shows the next booking day. After midnight it follows
-- Bangkok today, and the same QR keeps working.

create or replace function private.helper_board_state(p_date date, p_open text, p_close text)
returns text
language plpgsql
stable
set search_path = private, pg_temp
as $$
declare
  v_today date;
begin
  -- Hours are ignored. p_open / p_close stay in the signature for existing callers.
  if p_date is null then
    return 'invalid';
  end if;

  v_today := (timezone('Asia/Bangkok', now()))::date;

  if p_date < v_today then
    return 'closed';
  end if;
  if p_date > v_today + 1 then
    return 'too_early';
  end if;
  return 'ok';
end;
$$;

create or replace function public.portal_admin_open_helper_board()
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
  v_today date := (timezone('Asia/Bangkok', now()))::date;
  v_row private.helper_day_keys%rowtype;
  v_board date;
begin
  perform private.require_admin();

  select k.* into v_row
  from private.helper_day_keys k
  order by k.tour_date desc
  limit 1;

  if v_row.tour_date is null then
    v_board := v_today + 1;
    insert into private.helper_day_keys as k (tour_date, access_key, open_time, close_time, updated_at)
    values (v_board, private.new_access_key(), '00:00', '23:59', timezone('utc', now()))
    returning k.* into v_row;
  elsif v_row.tour_date > v_today then
    v_board := v_row.tour_date;
  else
    v_board := v_today;
  end if;

  return query select v_board, v_row.access_key, '00:00'::text, '23:59'::text;
end;
$$;

revoke all on function public.portal_admin_open_helper_board() from public, anon;
grant execute on function public.portal_admin_open_helper_board() to authenticated;

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
  v_latest date;
  v_today date;
  v_state text;
begin
  if p_date is null or v_key = '' then
    raise exception 'This helper QR is not valid.';
  end if;

  select k.* into v_row
  from private.helper_day_keys k
  where k.access_key = v_key;

  if v_row.tour_date is null then
    raise exception 'This helper QR is not valid.';
  end if;

  select max(k.tour_date) into v_latest
  from private.helper_day_keys k;

  if v_row.tour_date is distinct from v_latest then
    raise exception 'This helper QR is not valid.';
  end if;

  v_today := (timezone('Asia/Bangkok', now()))::date;

  -- Issued day (including the next booking day), or today after that day has started.
  if p_date is distinct from v_row.tour_date
     and not (p_date = v_today and v_today >= v_row.tour_date) then
    raise exception 'This helper QR is not valid.';
  end if;

  v_state := private.helper_board_state(p_date, v_row.open_time, v_row.close_time);

  if v_state is distinct from 'ok' then
    return query select p_date, null::text, '00:00'::text, '23:59'::text, v_state;
    return;
  end if;

  perform private.upsert_email_auth_user(
    private.helper_auth_email(p_date),
    v_row.access_key,
    jsonb_build_object('role', 'helper', 'helper_date', p_date::text)
  );

  return query
    select
      p_date,
      private.helper_auth_email(p_date),
      '00:00'::text,
      '23:59'::text,
      v_state;
end;
$$;
