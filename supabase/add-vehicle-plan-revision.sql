-- Optimistic concurrency for van board saves (same idea as boat revision).
-- Safe to re-run.

alter table public.day_vehicle_plans
  add column if not exists revision int not null default 1;

alter table public.day_vehicle_plans
  drop constraint if exists day_vehicle_plans_revision_check;
alter table public.day_vehicle_plans
  add constraint day_vehicle_plans_revision_check check (revision >= 1);

create or replace function public.portal_save_day_vehicle_plan(
  p_date date,
  p_program text,
  p_expected_revision int,
  p_van_capacity int,
  p_van_meta jsonb,
  p_assignments jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rev int;
  v_next int;
  v_exists boolean;
  v_item jsonb;
  v_van int;
  v_code text;
  v_pax int;
  v_sort int;
  v_capacity int;
begin
  if p_program is distinct from 'PP' and p_program is distinct from 'James Bond' then
    return jsonb_build_object('ok', false, 'error', 'Invalid program.');
  end if;

  v_capacity := greatest(1, least(coalesce(p_van_capacity, 12), 60));

  select true, revision into v_exists, v_rev
  from public.day_vehicle_plans
  where date = p_date and program = p_program
  for update;

  if coalesce(v_exists, false) then
    if coalesce(p_expected_revision, 0) <= 0 or v_rev is distinct from p_expected_revision then
      return jsonb_build_object(
        'ok', false,
        'error', 'Van board was updated on another device. Refresh and try again.',
        'conflict', true,
        'revision', v_rev
      );
    end if;
    v_next := v_rev + 1;
  else
    v_next := 1;
  end if;

  insert into public.day_vehicle_plans (date, program, van_capacity, revision)
  values (p_date, p_program, v_capacity, v_next)
  on conflict (date, program) do update set
    van_capacity = excluded.van_capacity,
    revision = excluded.revision,
    updated_at = timezone('utc', now());

  delete from public.van_assignments
  where date = p_date and program = p_program;

  delete from public.van_meta
  where date = p_date and program = p_program;

  if p_van_meta is not null and jsonb_typeof(p_van_meta) = 'array' then
    for v_item in select value from jsonb_array_elements(p_van_meta) as t(value)
    loop
      v_van := greatest(1, coalesce(nullif(v_item->>'van_number', '')::int, 0));
      if v_van < 1 then continue; end if;
      insert into public.van_meta (
        date, program, van_number, plate, driver, phone,
        outsourced, outsource_company, special_kind,
        transfer_in, transfer_out, charge_amount, capacity
      ) values (
        p_date,
        p_program,
        v_van,
        coalesce(v_item->>'plate', ''),
        coalesce(v_item->>'driver', ''),
        coalesce(v_item->>'phone', ''),
        coalesce((v_item->>'outsourced')::boolean, false),
        coalesce(v_item->>'outsource_company', ''),
        coalesce(v_item->>'special_kind', ''),
        coalesce((v_item->>'transfer_in')::boolean, false),
        coalesce((v_item->>'transfer_out')::boolean, false),
        coalesce(nullif(v_item->>'charge_amount', '')::numeric, 0),
        nullif(v_item->>'capacity', '')::int
      );
    end loop;
  end if;

  if p_assignments is not null and jsonb_typeof(p_assignments) = 'array' then
    for v_item in select value from jsonb_array_elements(p_assignments) as t(value)
    loop
      v_code := nullif(trim(coalesce(v_item->>'booking_code', '')), '');
      v_van := greatest(1, coalesce(nullif(v_item->>'van_number', '')::int, 0));
      v_pax := greatest(0, coalesce(nullif(v_item->>'pax', '')::int, 0));
      v_sort := greatest(0, coalesce(nullif(v_item->>'sort_order', '')::int, 0));
      if v_code is null or v_van < 1 or v_pax <= 0 then continue; end if;
      insert into public.van_assignments (
        date, program, booking_code, van_number, pax, sort_order
      ) values (
        p_date, p_program, v_code, v_van, v_pax, v_sort
      );
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'revision', v_next);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke all on function public.portal_save_day_vehicle_plan(date, text, int, int, jsonb, jsonb) from public;
grant execute on function public.portal_save_day_vehicle_plan(date, text, int, int, jsonb, jsonb) to authenticated;
