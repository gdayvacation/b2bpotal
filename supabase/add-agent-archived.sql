-- Agents with bookings cannot be hard-deleted (bookings.agent_slug FK).
-- archived=true hides them from the admin agent list while bookings keep their slug.

alter table public.agents
  add column if not exists archived boolean not null default false;

create index if not exists agents_listed_idx on public.agents (archived)
  where archived = false;