-- Remembered driver roster (name → phone + plate).
-- Run once in Supabase SQL Editor.

create table if not exists public.drivers (
  name text primary key,
  phone text not null default '',
  plate text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists drivers_set_updated_at on public.drivers;
create trigger drivers_set_updated_at
before update on public.drivers
for each row execute function public.set_updated_at();

alter table public.drivers enable row level security;

drop policy if exists pilot_drivers_all on public.drivers;
create policy pilot_drivers_all on public.drivers
  for all using (true) with check (true);

insert into public.drivers (name, phone, plate)
values
  ('พี่กุ๊กไก่', '092-8393294', '31-7558'),
  ('พี่เอ็น', '0980421384', '31-8773'),
  ('พี่มนัส', '092-3360029', '31-1643'),
  ('พี่แขก', '0989038477', '31-7558'),
  ('NAN', '098-8645905', '31-5873'),
  ('YOT', '093-5796656', '31-8515'),
  ('นน', '0629754977', '30-1440')
on conflict (name) do nothing;
