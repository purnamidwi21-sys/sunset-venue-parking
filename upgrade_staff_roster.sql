-- Update daftar petugas Sunset Venue Parking tanpa memutus relasi data historis.
-- Rename nama lama agar riwayat bertugas dan pembayaran tetap terhubung ke ID petugas yang sama.
update public.staff set full_name = 'Dek Putra' where full_name = 'Pak Dek Putra';
update public.staff set full_name = 'Pak Riky' where full_name = 'Pak Riki';

-- Tambahkan petugas baru dan pastikan seluruh tujuh nama aktif.
insert into public.staff (full_name, active) values
  ('Pak Manik', true),
  ('Pak Bayu', true),
  ('Pak Ganes', true),
  ('Pak Gangga', true),
  ('Pak Riky', true),
  ('Pak Dilan', true),
  ('Dek Putra', true)
on conflict (full_name) do update set active = true;

-- Daftar aktif setelah perubahan:
-- Pak Manik, Pak Bayu, Pak Ganes, Pak Gangga, Pak Riky, Pak Dilan, Dek Putra
