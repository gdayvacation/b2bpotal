-- Special transfer vans: Private Van / Other Service, Transfer In/Out, charge.
-- Run once in Supabase SQL Editor.

alter table public.van_meta
  add column if not exists special_kind text not null default '';

alter table public.van_meta
  add column if not exists transfer_in boolean not null default false;

alter table public.van_meta
  add column if not exists transfer_out boolean not null default false;

alter table public.van_meta
  add column if not exists charge_amount numeric not null default 0;
