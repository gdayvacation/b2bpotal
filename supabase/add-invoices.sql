-- Agency invoice rates, invoices / billing notes, and receipts.
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.invoice_settings (
  id text primary key default 'default',
  company_name text not null default 'Good Day Vacation Co., Ltd',
  company_legal text not null default 'Good Day Vacation Co., Ltd.',
  address_th text not null default 'สำนักงานใหญ่ : 35/84 หมู่ที่ 3 ตำบลรัษฎา อำเภอเมือง จังหวัดภูเก็ต',
  address_en text not null default 'Head Office : 35/84 Moo 3, Ratsada, Mueang, Phuket',
  bank_name text not null default 'SCB Bank',
  bank_account_type text not null default 'Saving account',
  bank_account_name text not null default 'Nusara Darayang',
  bank_account_no text not null default '822-215284-9',
  issuer_name text not null default 'Jererawan',
  issuer_title text not null default 'Director',
  signature_image text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.invoice_settings (id)
values ('default')
on conflict (id) do nothing;

drop trigger if exists invoice_settings_set_updated_at on public.invoice_settings;
create trigger invoice_settings_set_updated_at
before update on public.invoice_settings
for each row execute function public.set_updated_at();

create table if not exists public.agency_invoice_rates (
  agent_slug text primary key,
  adult_price numeric not null default 0,
  child_price numeric not null default 0,
  infant_price numeric not null default 0,
  tour_leader_price numeric not null default 0,
  change_date_price numeric not null default 0,
  cancel_price numeric not null default 0,
  private_transfer_extra numeric not null default 0,
  extra_zone_charge numeric not null default 0,
  other_service_charge numeric not null default 0,
  other_service_label text not null default 'Other Service Charge',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists agency_invoice_rates_set_updated_at on public.agency_invoice_rates;
create trigger agency_invoice_rates_set_updated_at
before update on public.agency_invoice_rates
for each row execute function public.set_updated_at();

create table if not exists public.invoices (
  id text primary key,
  invoice_no text not null unique,
  kind text not null check (kind in ('invoice', 'billing_note')),
  agent_slug text not null,
  agent_name text not null,
  issue_date date not null,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  notes text not null default '',
  grand_total numeric not null default 0,
  paid_at timestamptz,
  payment_channel text,
  receipt_no text,
  linked_invoice_ids jsonb not null default '[]'::jsonb,
  send_to_agent boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists invoices_agent_idx on public.invoices (agent_slug);
create index if not exists invoices_issue_date_idx on public.invoices (issue_date);
create index if not exists invoices_status_idx on public.invoices (status);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create table if not exists public.invoice_items (
  id text primary key,
  invoice_id text not null references public.invoices (id) on delete cascade,
  booking_code text not null default '',
  travel_date date,
  voucher_no text not null default '',
  description text not null default '',
  adults int not null default 0,
  children int not null default 0,
  infants int not null default 0,
  tour_leaders int not null default 0,
  adult_price numeric not null default 0,
  child_price numeric not null default 0,
  infant_price numeric not null default 0,
  tour_leader_price numeric not null default 0,
  cot numeric not null default 0,
  amount numeric not null default 0,
  line_kind text not null default 'tour',
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);
create index if not exists invoice_items_booking_idx on public.invoice_items (booking_code);

alter table public.invoice_settings enable row level security;
alter table public.agency_invoice_rates enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

drop policy if exists pilot_invoice_settings_all on public.invoice_settings;
create policy pilot_invoice_settings_all on public.invoice_settings
  for all to anon, authenticated using (true) with check (true);

drop policy if exists pilot_agency_invoice_rates_all on public.agency_invoice_rates;
create policy pilot_agency_invoice_rates_all on public.agency_invoice_rates
  for all to anon, authenticated using (true) with check (true);

drop policy if exists pilot_invoices_all on public.invoices;
create policy pilot_invoices_all on public.invoices
  for all to anon, authenticated using (true) with check (true);

drop policy if exists pilot_invoice_items_all on public.invoice_items;
create policy pilot_invoice_items_all on public.invoice_items
  for all to anon, authenticated using (true) with check (true);
