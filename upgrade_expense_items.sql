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

-- Payment ledger: records actual disbursements to each profit-share recipient.
create table if not exists public.payout_payments (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  recipient_type text not null check(recipient_type in ('sunset','adat','staff')),
  recipient_name text not null,
  amount numeric(14,2) not null check(amount > 0),
  payment_method text not null default 'Tunai',
  note text not null default '',
  paid_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz not null default now()
);
create index if not exists payout_payments_record_idx on public.payout_payments(daily_record_id);
create index if not exists payout_payments_recipient_idx on public.payout_payments(recipient_type,recipient_name);

alter table public.payout_payments enable row level security;
drop policy if exists "authenticated read payout payments" on public.payout_payments;
create policy "authenticated read payout payments" on public.payout_payments for select to authenticated using(true);
drop policy if exists "admins insert payout payments" on public.payout_payments;
create policy "admins insert payout payments" on public.payout_payments for insert to authenticated with check(public.is_admin());
drop policy if exists "admins delete payout payments" on public.payout_payments;
create policy "admins delete payout payments" on public.payout_payments for delete to authenticated using(public.is_admin());
