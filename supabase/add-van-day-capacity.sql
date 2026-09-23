-- Per-van seat count for a single departure day (default stays 12).
-- Run once in Supabase SQL Editor.

alter table public.van_meta
  add column if not exists capacity int;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'van_meta_capacity_check'
  ) then
    alter table public.van_meta
      add constraint van_meta_capacity_check
      check (capacity is null or (capacity >= 1 and capacity <= 40));
  end if;
end $$;
