-- Signature image + company name on invoice paper.
-- Run once in the Supabase SQL Editor after add-invoices.sql. Safe to re-run.

alter table public.invoice_settings
  add column if not exists signature_image text not null default '';

update public.invoice_settings
set company_name = 'Good Day Vacation Co., Ltd'
where id = 'default'
  and company_name = 'Good Day Vacation Speedboat';
