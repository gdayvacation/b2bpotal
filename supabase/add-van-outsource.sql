-- Mark a day van as hired from an outside company.
-- Run once in Supabase SQL Editor.

alter table public.van_meta
  add column if not exists outsourced boolean not null default false;

alter table public.van_meta
  add column if not exists outsource_company text not null default '';
