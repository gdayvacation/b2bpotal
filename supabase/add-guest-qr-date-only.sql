-- QR is valid only on the exact tour date (Asia/Bangkok), 00:00–19:00.
-- Before this migration the window opened before the tour date too.
-- Safe to re-run; updates the private helper function in-place; no schema changes.

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

  -- Open only on the exact tour date; block both before and after.
  if v_today <> p_tour_date then
    return true;
  end if;

  v_minutes := (extract(hour from v_now)::int * 60) + extract(minute from v_now)::int;
  return v_minutes >= v_close_minutes;
end;
$$;
