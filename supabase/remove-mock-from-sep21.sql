-- Deprecated alias — same cleanup as remove-mock-from-sep20.sql
-- Prefer running: supabase/remove-mock-from-sep20.sql

-- Remove seed/mock bookings from 20 Sept 2026 onward.
-- Cascades to van_assignments, boat_assignments, booking_events.

delete from public.bookings
where code in (
  'JB2609-0014',
  'PP2609-0205',
  'PP2609-0206',
  'PP2609-0207',
  'PP2609-0208',
  'PP2609-0209',
  'PP2609-0210',
  'PP2609-0211',
  'PP2609-0212',
  'PP2609-0213',
  'PP2609-0214',
  'PP2609-0215',
  'PP2609-0216',
  'JB2609-0197',
  'JB2609-0198',
  'JB2609-0199',
  'JB2609-0200',
  'JB2609-0201',
  'JB2609-0202',
  'JB2609-0203',
  'JB2609-0204',
  'PP2609-0034',
  'JB2609-0016',
  'PP2610-0001',
  'JB2610-0001',
  'PP2610-0002',
  'JB2610-0002',
  'PP2610-0003',
  'PP2611-0001',
  'JB2611-0001',
  'PP2611-0002',
  'JB2611-0002'
);

delete from public.bookings
where date >= '2026-09-20'
  and agent_slug in (
    'abc-travel',
    'mumbai-holidays',
    'delhi-travel',
    'golden-triangle'
  )
  and code ~ '^(PP|JB)[0-9]{4}-[0-9]{4}$';

delete from public.boat_assignments
where date >= '2026-09-20'
  and booking_code not in (select code from public.bookings);

delete from public.van_assignments
where date >= '2026-09-20'
  and booking_code not in (select code from public.bookings);
