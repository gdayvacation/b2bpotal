-- PERF sprint-9b (design, not yet applied): consolidate the 13 separate check-in
-- table fetches (fetchCheckInMaps' 8 tables + arrived-pax-db / booked-pax-db /
-- day-ops-db's 5 tables) into ONE PostgREST round-trip.
--
-- Today, every realtime-triggered or polled check-in sync does 13 separate
-- `GET /rest/v1/<table>?date=...` requests. Log analysis (Oct 6 08:00-10:30
-- rush) showed this is ~47% of all staff-side requests in that window. This
-- function returns all 13 tables as one JSON object for a date range, cutting
-- that to 1 request per sync cycle.
--
-- Run once in Supabase SQL Editor. Safe to re-run (create or replace).
-- Does NOT change any existing table, policy, or trigger — purely additive.
-- `security invoker` so it runs under the caller's existing RLS, same as today.

create or replace function public.portal_fetch_check_in_snapshot(
  p_since_date date,
  p_until_date date
)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'enrollments', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_enrollments t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'attendance', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_attendance t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'payments', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_payments t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'services', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_services t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'sequences', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_sequences t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'guest_edits', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_guest_edits t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'notes', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_notes t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'group_guides', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_group_guides t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'booked_pax', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_booked_pax t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'arrived_pax', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.check_in_arrived_pax t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'own_arrivals', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.own_arrivals t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'pickup_no_shows', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.pickup_no_shows t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb),

    'job_order_actions', coalesce((
      select jsonb_agg(to_jsonb(t))
      from public.job_order_actions t
      where t.date >= p_since_date and t.date <= p_until_date
    ), '[]'::jsonb)
  );
$$;

-- Lets both anon (guest-tier requests, none currently call this) and
-- authenticated (staff) callers execute it; RLS on each underlying table
-- still applies per-row exactly as it does today (security invoker).
grant execute on function public.portal_fetch_check_in_snapshot(date, date) to anon, authenticated;

comment on function public.portal_fetch_check_in_snapshot(date, date) is
  'PERF sprint-9b: single-request snapshot of all 13 check-in tables for a date range. '
  'Returns the same rows the client previously fetched via 13 separate REST calls. '
  'If any underlying table does not exist yet (migration not run), this whole RPC call '
  'fails — client should keep the existing 13-request path as a fallback for projects '
  'that have not run every add-check-in-*.sql migration.';
