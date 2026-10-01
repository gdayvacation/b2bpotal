-- Marina check-in pax override (when admin edits guests at check-in only).
-- Booking and invoice stay as originally booked until admin chooses to sync.
-- Prefer supabase/add-check-in-concurrency.sql (includes RLS + atomic RPC).
-- Safe to re-run.

create table if not exists public.check_in_arrived_pax (
  date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  booking_code text not null,
  adults int not null default 0 check (adults >= 0),
  children int not null default 0 check (children >= 0),
  infants int not null default 0 check (infants >= 0),
  tour_leaders int not null default 0 check (tour_leaders >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (date, program, booking_code)
);

create index if not exists check_in_arrived_pax_date_program_idx
  on public.check_in_arrived_pax (date, program);

drop trigger if exists check_in_arrived_pax_set_updated_at on public.check_in_arrived_pax;
create trigger check_in_arrived_pax_set_updated_at
before update on public.check_in_arrived_pax
for each row execute function public.set_updated_at();

alter table public.check_in_arrived_pax enable row level security;

drop policy if exists pilot_check_in_arrived_pax_all on public.check_in_arrived_pax;
drop policy if exists check_in_arrived_pax_staff_all on public.check_in_arrived_pax;
drop policy if exists check_in_arrived_pax_helper_all on public.check_in_arrived_pax;
drop policy if exists check_in_arrived_pax_guest_all on public.check_in_arrived_pax;
drop policy if exists check_in_arrived_pax_partner_select on public.check_in_arrived_pax;

create policy check_in_arrived_pax_staff_all on public.check_in_arrived_pax
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

create policy check_in_arrived_pax_helper_all on public.check_in_arrived_pax
  for all to authenticated
  using (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date())
  with check (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date());

create policy check_in_arrived_pax_guest_all on public.check_in_arrived_pax
  for all to authenticated
  using (public.jwt_role() = 'guest' and booking_code = public.jwt_booking_code())
  with check (public.jwt_role() = 'guest' and booking_code = public.jwt_booking_code());

create policy check_in_arrived_pax_partner_select on public.check_in_arrived_pax
  for select to authenticated
  using (
    public.jwt_role() = 'partner'
    and exists (
      select 1
      from public.bookings b
      where b.code = check_in_arrived_pax.booking_code
        and b.agent_slug = public.jwt_agent_slug()
    )
  );
