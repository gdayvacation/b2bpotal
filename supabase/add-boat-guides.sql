-- Guide + assistant contacts per boat for Guide Job Order.
-- Run once in Supabase SQL Editor.
-- Safe without boat_names / capacities — defaults to 3 empty guide slots.

alter table public.day_boat_plans
  add column if not exists boat_guides jsonb not null default '[]'::jsonb;

update public.day_boat_plans
set boat_guides = jsonb_build_array(
  '{"guideName":"","guidePhone":"","assistantName":"","assistantPhone":""}'::jsonb,
  '{"guideName":"","guidePhone":"","assistantName":"","assistantPhone":""}'::jsonb,
  '{"guideName":"","guidePhone":"","assistantName":"","assistantPhone":""}'::jsonb
)
where boat_guides is null
   or jsonb_typeof(boat_guides) <> 'array'
   or jsonb_array_length(boat_guides) = 0;

-- If flexible capacities exist, stretch guide slots to match boat count.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'day_boat_plans'
      and column_name = 'capacities'
  ) then
    update public.day_boat_plans p
    set boat_guides = (
      select coalesce(
        jsonb_agg(
          coalesce(
            p.boat_guides -> (gs.i - 1),
            '{"guideName":"","guidePhone":"","assistantName":"","assistantPhone":""}'::jsonb
          )
          order by gs.i
        ),
        '[]'::jsonb
      )
      from generate_series(
        1,
        greatest(coalesce(jsonb_array_length(p.capacities), 0), 3)
      ) as gs(i)
    )
    where jsonb_array_length(p.boat_guides)
       <> greatest(coalesce(jsonb_array_length(p.capacities), 0), 3);
  end if;
end $$;
