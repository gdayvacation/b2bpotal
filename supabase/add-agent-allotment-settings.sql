-- Per-agent allotment setup: how heads are deducted.
--   deduct_children = true  -> adults AND children come off the head count (default).
--   deduct_children = false -> only adults come off the head count. Children are
--                              still listed on the daily sheet but marked "invoiced"
--                              because the agent pays for them on a separate invoice.
-- No row = deduct everyone. Safe to re-run.

create table if not exists public.agent_allotment_settings (
  agent_slug text not null,
  program text not null default 'PP'
    check (program in ('PP', 'James Bond')),
  deduct_children boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (agent_slug, program)
);

drop trigger if exists agent_allotment_settings_set_updated_at on public.agent_allotment_settings;
create trigger agent_allotment_settings_set_updated_at
before update on public.agent_allotment_settings
for each row execute function public.set_updated_at();

alter table public.agent_allotment_settings enable row level security;

drop policy if exists agent_allotment_settings_staff_all on public.agent_allotment_settings;
create policy agent_allotment_settings_staff_all on public.agent_allotment_settings
  for all to authenticated
  using (public.jwt_is_staff())
  with check (public.jwt_is_staff());

grant select, insert, update, delete on table public.agent_allotment_settings to authenticated;
