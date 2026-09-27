-- Free-text charge unit on invoice lines (Pax, Box, Pcs, Van, …).
-- Safe to re-run.

alter table public.invoice_items
  add column if not exists unit text not null default '';
