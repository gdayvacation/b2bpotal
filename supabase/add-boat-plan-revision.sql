-- Optimistic concurrency for marina boat board saves.
-- Safe to re-run.

alter table public.day_boat_plans
  add column if not exists revision int not null default 1;

alter table public.day_boat_plans
  drop constraint if exists day_boat_plans_revision_check;
alter table public.day_boat_plans
  add constraint day_boat_plans_revision_check check (revision >= 1);

create or replace function public.portal_save_day_boat_plan(
  p_date date,
  p_program text,
  p_expected_revision int,
  p_capacities jsonb,
  p_boat_names jsonb,
  p_boat_guides jsonb,
  p_boat_kinds jsonb,
  p_boat_labels jsonb,
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
  v_code text;
  v_boat int;
  v_pax int;
  v_cap1 int;
  v_cap2 int;
  v_cap3 int;
begin
  if p_program is distinct from 'PP' and p_program is distinct from 'James Bond' then
    return jsonb_build_object('ok', false, 'error', 'Invalid program.');
  end if;

  select true, revision into v_exists, v_rev
  from public.day_boat_plans
  where date = p_date and program = p_program
  for update;

  if coalesce(v_exists, false) then
    if coalesce(p_expected_revision, 0) <= 0 or v_rev is distinct from p_expected_revision then
      return jsonb_build_object(
        'ok', false,
        'error', 'Boat board was updated on another device. Refresh and try again.',
        'conflict', true,
        'revision', v_rev
      );
    end if;
    v_next := v_rev + 1;
  else
    v_next := 1;
  end if;

  v_cap1 := greatest(1, coalesce((p_capacities->>0)::int, 44));
  v_cap2 := greatest(1, coalesce((p_capacities->>1)::int, v_cap1));
  v_cap3 := greatest(1, coalesce((p_capacities->>2)::int, v_cap1));

  insert into public.day_boat_plans (
    date, program, capacity_1, capacity_2, capacity_3,
    capacities, boat_names, boat_guides, boat_kinds, boat_labels, revision
  ) values (
    p_date, p_program, v_cap1, v_cap2, v_cap3,
    coalesce(p_capacities, '[]'::jsonb),
    coalesce(p_boat_names, '[]'::jsonb),
    coalesce(p_boat_guides, '[]'::jsonb),
    coalesce(p_boat_kinds, '[]'::jsonb),
    coalesce(p_boat_labels, '[]'::jsonb),
    v_next
  )
  on conflict (date, program) do update set
    capacity_1 = excluded.capacity_1,
    capacity_2 = excluded.capacity_2,
    capacity_3 = excluded.capacity_3,
    capacities = excluded.capacities,
    boat_names = excluded.boat_names,
    boat_guides = excluded.boat_guides,
    boat_kinds = excluded.boat_kinds,
    boat_labels = excluded.boat_labels,
    revision = excluded.revision,
    updated_at = timezone('utc', now());

  delete from public.boat_assignments
  where date = p_date and program = p_program;

  if p_assignments is not null and jsonb_typeof(p_assignments) = 'array' then
    for v_item in select value from jsonb_array_elements(p_assignments) as t(value)
    loop
      v_code := nullif(trim(coalesce(v_item->>'booking_code', '')), '');
      v_boat := greatest(1, coalesce(nullif(v_item->>'boat_number', '')::int, 0));
      v_pax := coalesce(nullif(v_item->>'pax', '')::int, 0);
      if v_code is null or v_boat < 1 then continue; end if;
      insert into public.boat_assignments (date, program, booking_code, boat_number, pax)
      values (
        p_date, p_program, v_code, v_boat,
        case when v_pax > 0 then v_pax else null end
      )
      on conflict (date, program, booking_code, boat_number) do update
        set pax = excluded.pax,
            updated_at = timezone('utc', now());
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'revision', v_next);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke all on function public.portal_save_day_boat_plan(date, text, int, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.portal_save_day_boat_plan(date, text, int, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
