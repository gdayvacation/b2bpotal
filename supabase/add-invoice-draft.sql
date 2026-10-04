-- Saved invoice line edits that are not issued yet.
-- Safe to re-run.

alter table public.invoices
  add column if not exists is_draft boolean not null default false;
