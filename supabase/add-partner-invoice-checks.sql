-- Dummy Van / partner-boat bookings we sent out.
-- Keep a check record when the partner invoices us back.
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.partner_invoice_checks (
  booking_code text primary key,
  travel_date date not null,
  program text not null check (program in ('PP', 'James Bond')),
  checked boolean not null default false,
  paid boolean not null default false,
  note text not null default '',
  checked_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists partner_invoice_checks_travel_date_idx
  on public.partner_invoice_checks (travel_date);

drop trigger if exists partner_invoice_checks_set_updated_at on public.partner_invoice_checks;
create trigger partner_invoice_checks_set_updated_at
before update on public.partner_invoice_checks
for each row execute function public.set_updated_at();

alter table public.partner_invoice_checks enable row level security;

drop policy if exists pilot_partner_invoice_checks_all on public.partner_invoice_checks;
create policy pilot_partner_invoice_checks_all on public.partner_invoice_checks
  for all to anon, authenticated using (true) with check (true);
