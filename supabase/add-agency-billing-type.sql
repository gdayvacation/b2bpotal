-- Per-agent billing type: Prebuy (deduct heads) or Invoice (bill tour money).
-- Safe to re-run.

alter table public.agency_invoice_rates
  add column if not exists billing_type text not null default 'invoice';

alter table public.agency_invoice_rates
  drop constraint if exists agency_invoice_rates_billing_type_check;

alter table public.agency_invoice_rates
  add constraint agency_invoice_rates_billing_type_check
  check (billing_type in ('prebuy', 'invoice'));
