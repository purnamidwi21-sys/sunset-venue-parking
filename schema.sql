-- Sunset Venue Parking - Supabase / PostgreSQL starter schema
-- Apply in a new Supabase project only after reviewing access policies.

create extension if not exists pgcrypto;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.staff (full_name) values
  ('Pak Gangga'),
  ('Pak Manik'),
  ('Pak Bayu'),
  ('Pak Dek Putra'),
  ('Pak Riki')
on conflict (full_name) do nothing;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null unique,
  total_revenue numeric(14,2) not null default 0 check (total_revenue >= 0),
  total_expenses numeric(14,2) not null default 0 check (total_expenses >= 0),
  note text,
  source text not null default 'manual' check (source in ('manual', 'excel_import')),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.staff_duty (
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (daily_record_id, staff_id)
);

create table if not exists public.revenue_entries (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.import_history (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  rows_read integer not null default 0,
  rows_added integer not null default 0,
  rows_updated integer not null default 0,
  rows_skipped integer not null default 0,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default now()
);

-- Derived profit sharing (avoid storing duplicate figures):
-- net = total_revenue - total_expenses
-- sunset_share = net * 0.25
-- adat_share = net * 0.25
-- staff_pool = net * 0.50
-- each_staff_share = staff_pool / count(staff_duty rows)
--
-- Before production:
-- 1. Enable RLS on every table.
-- 2. Add policies so only authenticated users can read records and only
--    admins can import, edit, or delete historical and daily records.
-- 3. Decide whether staff can create daily entries and whether they may
--    edit only the current date.
-- 4. Add audit logging and backup/restore procedures.
