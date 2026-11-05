-- Sunset Venue Parking | Supabase PostgreSQL schema
create extension if not exists pgcrypto;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.staff(full_name) values
('Pak Gangga'),('Pak Manik'),('Pak Bayu'),('Pak Dek Putra'),('Pak Riki')
on conflict(full_name) do nothing;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'staff' check(role in ('admin','staff')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.user_profiles(id, display_name, role)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)), 'staff')
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.user_profiles where id=auth.uid() and role='admin');
$$;

create table if not exists public.daily_records (
  id uuid primary key default gen_random_uuid(),
  record_date date not null unique,
  total_revenue numeric(14,2) not null default 0 check(total_revenue >= 0),
  total_expenses numeric(14,2) not null default 0 check(total_expenses >= 0),
  note text,
  source text not null default 'manual' check(source in ('manual','excel_import')),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.staff_duty (
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(daily_record_id,staff_id)
);

create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  category text not null,
  amount numeric(14,2) not null check(amount > 0),
  description text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists expense_items_daily_record_idx on public.expense_items(daily_record_id);

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

alter table public.staff enable row level security;
alter table public.user_profiles enable row level security;
alter table public.daily_records enable row level security;
alter table public.staff_duty enable row level security;
alter table public.expense_items enable row level security;
alter table public.import_history enable row level security;

drop policy if exists "authenticated read staff" on public.staff;
create policy "authenticated read staff" on public.staff for select to authenticated using(true);
drop policy if exists "admins manage staff" on public.staff;
create policy "admins manage staff" on public.staff for all to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "users read own profile and admins read all" on public.user_profiles;
create policy "users read own profile and admins read all" on public.user_profiles for select to authenticated using(id=auth.uid() or public.is_admin());
drop policy if exists "admins update profiles" on public.user_profiles;
create policy "admins update profiles" on public.user_profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());

drop policy if exists "authenticated read daily records" on public.daily_records;
create policy "authenticated read daily records" on public.daily_records for select to authenticated using(true);
drop policy if exists "staff create own daily records admins all" on public.daily_records;
create policy "staff create own daily records admins all" on public.daily_records for insert to authenticated with check(created_by=auth.uid() or public.is_admin());
drop policy if exists "staff update own daily records admins all" on public.daily_records;
drop policy if exists "authenticated update daily records" on public.daily_records;
create policy "authenticated update daily records" on public.daily_records for update to authenticated using(auth.uid() is not null) with check(auth.uid() is not null);
drop policy if exists "admins delete daily records" on public.daily_records;
create policy "admins delete daily records" on public.daily_records for delete to authenticated using(public.is_admin());

drop policy if exists "authenticated read duty" on public.staff_duty;
create policy "authenticated read duty" on public.staff_duty for select to authenticated using(true);
drop policy if exists "record owner or admin manages duty" on public.staff_duty;
drop policy if exists "authenticated manages duty" on public.staff_duty;
create policy "authenticated manages duty" on public.staff_duty for all to authenticated
using(auth.uid() is not null)
with check(auth.uid() is not null);

drop policy if exists "authenticated manage expense items" on public.expense_items;
create policy "authenticated manage expense items" on public.expense_items for all to authenticated
using(auth.uid() is not null)
with check(auth.uid() is not null);

drop policy if exists "admins read import history" on public.import_history;
create policy "admins read import history" on public.import_history for select to authenticated using(public.is_admin());
drop policy if exists "admins insert import history" on public.import_history;
create policy "admins insert import history" on public.import_history for insert to authenticated with check(public.is_admin());

-- Promote the first administrator after creating their Auth user:
-- update public.user_profiles p set role='admin'
-- from auth.users u where p.id=u.id and u.email='YOUR_ADMIN_EMAIL';
