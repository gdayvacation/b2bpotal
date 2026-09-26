-- Admin mark: send this invoice to the agent.
-- Safe to re-run.

alter table public.invoices
  add column if not exists send_to_agent boolean not null default false;
