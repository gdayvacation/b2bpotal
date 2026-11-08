-- Second rate line per agent (Included vs Excluded National Park).
-- Line 1 = main rate (existing rows). Line 2 = opposite National Park option, used for
-- bookings from 1 Nov 2026 onward. Safe to re-run.

alter table public.agency_invoice_rates
  add column if not exists rate_line smallint not null default 1;

alter table public.agency_invoice_rates
  drop constraint if exists agency_invoice_rates_rate_line_check;

alter table public.agency_invoice_rates
  add constraint agency_invoice_rates_rate_line_check check (rate_line in (1, 2));

alter table public.agency_invoice_rates
  drop constraint if exists agency_invoice_rates_pkey;

alter table public.agency_invoice_rates
  add primary key (agent_slug, rate_line);
