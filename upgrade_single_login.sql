-- Sunset Venue Parking: hanya 1 perangkat yang boleh login dalam satu waktu.
-- Jalankan SEKALI di Supabase -> SQL Editor -> New query -> tempel semua -> Run.
--
-- Cara kerja:
-- * Saat login, aplikasi "mengambil kunci". Bila kunci dipegang perangkat lain yang
--   masih aktif (ada tanda aktif dalam 5 menit terakhir), login ditolak.
-- * Aplikasi mengirim tanda aktif tiap 45 detik. Logout atau menutup tab melepas kunci.
-- * Bila perangkat ditutup tanpa logout dan tidak aktif lebih dari 5 menit, kunci bebas.
-- * Admin boleh mengambil alih kunci (perangkat lain otomatis keluar).

create table if not exists public.app_session_lock (
  id integer primary key default 1 check (id = 1),
  user_id uuid references auth.users(id) on delete set null,
  device_id text,
  display_name text,
  started_at timestamptz,
  last_seen timestamptz
);
insert into public.app_session_lock(id) values (1) on conflict (id) do nothing;

-- Tabel hanya bisa diakses lewat fungsi di bawah (tidak ada policy langsung).
alter table public.app_session_lock enable row level security;

create or replace function public.claim_app_session(p_device text, p_force boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  l public.app_session_lock;
  v_name text;
  v_timeout interval := interval '5 minutes';
begin
  if auth.uid() is null then
    raise exception 'Belum login';
  end if;
  insert into public.app_session_lock(id) values (1) on conflict (id) do nothing;
  select * into l from public.app_session_lock where id = 1 for update;

  if l.device_id is not null
     and l.device_id <> p_device
     and l.last_seen > now() - v_timeout
     and not (p_force and public.is_admin()) then
    return jsonb_build_object('ok', false, 'holder', l.display_name, 'since', l.started_at, 'last_seen', l.last_seen);
  end if;

  select coalesce(nullif(p.display_name, ''), u.email) into v_name
  from auth.users u left join public.user_profiles p on p.id = u.id
  where u.id = auth.uid();

  update public.app_session_lock set
    user_id = auth.uid(),
    device_id = p_device,
    display_name = v_name,
    started_at = case when l.device_id = p_device and l.last_seen > now() - v_timeout then l.started_at else now() end,
    last_seen = now()
  where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.heartbeat_app_session(p_device text)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  update public.app_session_lock set last_seen = now()
  where id = 1 and device_id = p_device and user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.release_app_session(p_device text)
returns void
language sql security definer set search_path = public
as $$
  update public.app_session_lock
  set user_id = null, device_id = null, display_name = null, started_at = null, last_seen = null
  where id = 1 and device_id = p_device;
$$;

revoke all on function public.claim_app_session(text, boolean) from public, anon;
revoke all on function public.heartbeat_app_session(text) from public, anon;
revoke all on function public.release_app_session(text) from public, anon;
grant execute on function public.claim_app_session(text, boolean) to authenticated;
grant execute on function public.heartbeat_app_session(text) to authenticated;
grant execute on function public.release_app_session(text) to authenticated;
