-- Payment channel on paid invoices / receipts.
-- Run once in the Supabase SQL Editor after add-invoices.sql. Safe to re-run.

alter table public.invoices
  add column if not exists payment_channel text;
