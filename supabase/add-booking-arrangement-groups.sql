-- Ops grouping from the OP report: which bookings sit together as Private or Partner
-- on the van / boat board. Run once in the SQL editor.

create table if not exists public.booking_arrangement_groups (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  group_kind text not null check (group_kind in ('private', 'partner')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

drop trigger if exists booking_arrangement_groups_set_updated_at on public.booking_arrangement_groups;
create trigger booking_arrangement_groups_set_updated_at
before update on public.booking_arrangement_groups
for each row execute function public.set_updated_at();

alter table public.booking_arrangement_groups enable row level security;

drop policy if exists booking_arrangement_groups_staff_all on public.booking_arrangement_groups;
create policy booking_arrangement_groups_staff_all
  on public.booking_arrangement_groups
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

drop policy if exists booking_arrangement_groups_helper_all on public.booking_arrangement_groups;
create policy booking_arrangement_groups_helper_all
  on public.booking_arrangement_groups
  for all to authenticated
  using (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date())
  with check (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date());

grant select, insert, update, delete on table public.booking_arrangement_groups to authenticated;

do $$
begin
  if to_regclass('public.booking_arrangement_groups') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'booking_arrangement_groups'
     ) then
    alter publication supabase_realtime add table public.booking_arrangement_groups;
  end if;
end $$;
