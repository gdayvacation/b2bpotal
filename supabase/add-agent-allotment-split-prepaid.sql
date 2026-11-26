-- Agents that keep trip heads/money on one sheet and prepaid cash on another (e.g. park fees).
-- No row = single combined sheet (default).

alter table public.agent_allotment_settings
  add column if not exists split_prepaid_ledger boolean not null default false;