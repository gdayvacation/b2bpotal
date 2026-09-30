-- Allow credit notes alongside invoices and billing notes.
alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices
  add constraint invoices_kind_check
  check (kind in ('invoice', 'billing_note', 'credit_note'));
