-- Guest name typed on an invoice line. Empty keeps the booking guest.
alter table public.invoice_items
  add column if not exists guest_name text not null default '';
