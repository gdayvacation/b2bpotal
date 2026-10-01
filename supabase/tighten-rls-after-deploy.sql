-- Apply AFTER the build with staff session restore (POST /api/staff/session) is live,
-- and after supabase/fix-guest-check-in-rpc.sql.
--
-- 1. Anonymous (not signed in) callers lose read/write on ops tables.
-- 2. check_in_group_guides pilot policy (anyone, any action) becomes role scoped.
-- 3. Guests become read-only except: edit their own existing enrollment, close an
--    edit window. Self check-in goes through portal_record_check_in_enrollments.
-- 4. Helpers keep full check-in desk access for their date, but cannot insert or
--    delete bookings, or change availability / closures.

begin;

-- 1. anon ----------------------------------------------------------------------
drop policy if exists agents_anon_all on public.agents;
drop policy if exists availability_anon_all on public.availability;
drop policy if exists boat_assignments_anon_all on public.boat_assignments;
drop policy if exists booking_closures_anon_all on public.booking_closures;
drop policy if exists booking_cutoffs_anon_all on public.booking_cutoffs;
drop policy if exists day_boat_plans_anon_all on public.day_boat_plans;
drop policy if exists day_vehicle_plans_anon_all on public.day_vehicle_plans;
drop policy if exists drivers_anon_all on public.drivers;
drop policy if exists fleet_vans_anon_all on public.fleet_vans;
drop policy if exists hotels_anon_all on public.hotels;
drop policy if exists pickup_zones_anon_all on public.pickup_zones;
drop policy if exists van_assignments_anon_all on public.van_assignments;
drop policy if exists van_meta_anon_all on public.van_meta;
drop policy if exists agent_allotments_anon_all on public.agent_allotments;
drop policy if exists agent_allotment_daily_anon_all on public.agent_allotment_daily;

-- 2. check_in_group_guides -----------------------------------------------------
drop policy if exists pilot_check_in_group_guides_all on public.check_in_group_guides;

create policy check_in_group_guides_staff_all on public.check_in_group_guides
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

create policy check_in_group_guides_helper_all on public.check_in_group_guides
  for all to authenticated
  using (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date())
  with check (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date());

create policy check_in_group_guides_guest_select on public.check_in_group_guides
  for select to authenticated
  using (public.jwt_role() = 'guest' and booking_code = public.jwt_booking_code());

create policy check_in_group_guides_partner_select on public.check_in_group_guides
  for select to authenticated
  using (
    public.jwt_role() = 'partner'
    and exists (
      select 1 from public.bookings b
      where b.code = check_in_group_guides.booking_code
        and b.agent_slug = public.jwt_agent_slug()
    )
  );

-- 3. guests --------------------------------------------------------------------
-- Upsert runs the INSERT check on the proposed row, so allow it only when the row
-- already exists for the guest's booking (i.e. an edit, never a new check-in).
create or replace function public.guest_owns_enrollment(p_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.jwt_role() = 'guest'
    and exists (
      select 1 from public.check_in_enrollments e
      where e.id = p_id and e.booking_code = public.jwt_booking_code()
    );
$$;
revoke all on function public.guest_owns_enrollment(text) from public, anon;
grant execute on function public.guest_owns_enrollment(text) to authenticated;

drop policy if exists check_in_enrollments_guest_all on public.check_in_enrollments;
create policy check_in_enrollments_guest_select on public.check_in_enrollments
  for select to authenticated
  using (public.jwt_role() = 'guest' and booking_code = public.jwt_booking_code());
create policy check_in_enrollments_guest_insert_existing on public.check_in_enrollments
  for insert to authenticated
  with check (booking_code = public.jwt_booking_code() and public.guest_owns_enrollment(id));
create policy check_in_enrollments_guest_update on public.check_in_enrollments
  for update to authenticated
  using (public.jwt_role() = 'guest' and booking_code = public.jwt_booking_code())
  with check (public.jwt_role() = 'guest' and booking_code = public.jwt_booking_code());

drop policy if exists check_in_guest_edits_guest_all on public.check_in_guest_edits;
create policy check_in_guest_edits_guest_select on public.check_in_guest_edits
  for select to authenticated
  using (public.jwt_role() = 'guest' and booking_code = public.jwt_booking_code());
create policy check_in_guest_edits_guest_delete on public.check_in_guest_edits
  for delete to authenticated
  using (public.jwt_role() = 'guest' and booking_code = public.jwt_booking_code());

do $$
declare
  t text;
begin
  foreach t in array array[
    'check_in_arrived_pax', 'check_in_attendance', 'check_in_booked_pax',
    'check_in_notes', 'check_in_sequences', 'check_in_services',
    'job_order_actions', 'own_arrivals', 'pickup_no_shows', 'booking_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_guest_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_guest_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (public.jwt_role() = %L and booking_code = public.jwt_booking_code())',
      t || '_guest_select', t, 'guest'
    );
  end loop;
end $$;

drop policy if exists check_in_payments_guest_all on public.check_in_payments;
create policy check_in_payments_guest_select on public.check_in_payments
  for select to authenticated
  using (public.jwt_payment_seat_for_guest(seat_key));

-- 4. helpers -------------------------------------------------------------------
drop policy if exists bookings_helper_all on public.bookings;
create policy bookings_helper_select on public.bookings
  for select to authenticated
  using (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date());
create policy bookings_helper_update on public.bookings
  for update to authenticated
  using (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date())
  with check (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date());

drop policy if exists booking_events_helper_all on public.booking_events;
create policy booking_events_helper_select on public.booking_events
  for select to authenticated
  using (
    public.jwt_role() = 'helper'
    and exists (
      select 1 from public.bookings b
      where b.code = booking_events.booking_code and b.date::text = public.jwt_helper_date()
    )
  );
create policy booking_events_helper_insert on public.booking_events
  for insert to authenticated
  with check (
    public.jwt_role() = 'helper'
    and exists (
      select 1 from public.bookings b
      where b.code = booking_events.booking_code and b.date::text = public.jwt_helper_date()
    )
  );

drop policy if exists availability_helper_all on public.availability;
create policy availability_helper_select on public.availability
  for select to authenticated
  using (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date());

drop policy if exists booking_closures_helper_all on public.booking_closures;
create policy booking_closures_helper_select on public.booking_closures
  for select to authenticated
  using (public.jwt_role() = 'helper' and date::text = public.jwt_helper_date());

commit;
