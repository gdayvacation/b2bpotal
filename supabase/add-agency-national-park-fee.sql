-- Agency National Park: INC (included) or Exc fee (default 400 THB).
alter table public.agency_invoice_rates
  add column if not exists national_park_fee numeric not null default 400;

alter table public.agency_invoice_rates
  add column if not exists national_park_included boolean not null default false;

update public.agency_invoice_rates
set national_park_fee = 400
where national_park_fee is null;
