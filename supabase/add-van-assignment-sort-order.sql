-- Pickup stop order within a van (admin can reorder hotels).
-- Run once in Supabase SQL Editor.

alter table public.van_assignments
  add column if not exists sort_order int not null default 0;

create index if not exists van_assignments_van_order_idx
  on public.van_assignments (date, program, van_number, sort_order);
