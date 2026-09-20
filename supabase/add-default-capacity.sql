-- Default daily seat capacity: PP 44 · James Bond 40.
-- Run once in Supabase SQL Editor.
-- Only updates the table default for new rows; existing availability
-- overrides are left as-is. Days with no row already use app defaults.

alter table public.availability
  alter column pp_capacity set default 44;

alter table public.availability
  alter column james_bond_capacity set default 40;
