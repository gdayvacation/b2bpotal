-- Paid / not-paid action on Send to Partner invoice checks.
-- Run after add-partner-invoice-checks.sql. Safe to re-run.

alter table public.partner_invoice_checks
  add column if not exists paid boolean not null default false;

alter table public.partner_invoice_checks
  add column if not exists paid_at timestamptz;
