-- Partial payments on invoices (multiple instalments per bill).
-- Safe to re-run.

alter table public.invoices
  drop constraint if exists invoices_status_check;

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('unpaid', 'partial', 'paid'));

alter table public.invoices
  add column if not exists payments jsonb not null default '[]'::jsonb;
