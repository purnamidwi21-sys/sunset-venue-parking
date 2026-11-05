-- Run this once in Supabase SQL Editor to add itemized daily expenses.
create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  category text not null,
  amount numeric(14,2) not null check(amount > 0),
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists expense_items_daily_record_idx on public.expense_items(daily_record_id);
alter table public.expense_items enable row level security;
drop policy if exists "authenticated manage expense items" on public.expense_items;
create policy "authenticated manage expense items" on public.expense_items for all to authenticated
using(auth.uid() is not null)
with check(auth.uid() is not null);
