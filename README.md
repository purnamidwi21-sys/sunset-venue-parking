# Sunset Venue Parking

Staff-only parking finance application for Sunset Venue.

## Stack
- Static frontend: HTML/CSS/JavaScript hosted on GitHub Pages.
- Authentication and cloud database: Supabase Auth + PostgreSQL.
- Spreadsheet import/export: SheetJS.
- PDF reports: jsPDF.

## Current features
- Email/password login.
- Admin and Staff roles.
- Daily revenue and expense entry.
- Select the five registered parking attendants.
- Automatic profit share: Sunset Venue 25%, Adat 25%, staff pool 50%.
- Staff pool split equally among staff on duty on that date.
- Dashboard and custom date-range reports.
- Historical XLSX/XLS/CSV import (Admin only).
- Excel backup export.
- PDF download and WhatsApp share where browser file-sharing is supported.

## Supabase setup (required once)
1. Open the Supabase project SQL Editor.
2. Open `schema.sql` in this repository, copy its full contents, paste into SQL Editor, and click Run.
3. In Supabase Authentication settings, create the first user (the administrator) with email and password.
4. In SQL Editor, promote that user to Admin by running this query, replacing the email:
   ```sql
   update public.user_profiles p
   set role = 'admin'
   from auth.users u
   where p.id = u.id and u.email = 'ADMIN_EMAIL';
   ```
5. Create staff accounts in Authentication → Users (invite or add user). New accounts automatically receive the Staff role.
6. In Supabase Authentication → URL Configuration, add the published GitHub Pages URL to Site URL and Redirect URLs.
7. Sign in to the app with the admin account.

The frontend uses the project's Supabase URL and publishable/anon key. These are client-side credentials; never put a service-role key or database password in frontend code.

## GitHub Pages
The repository includes `.github/workflows/deploy-pages.yml`.
1. Open repository Settings → Pages.
2. Set Source to **GitHub Actions**.
3. Wait for the workflow under the Actions tab to finish.
4. Open the Pages URL shown in the deployment job.

## Historical Excel format
The first worksheet must have a header row. Required columns:
- Date: Tanggal, Date, or Tgl
- Revenue: Revenue, Total Revenue, or Pendapatan
- Expenses: Pengeluaran, Expenses, or Total Pengeluaran

Optional:
- Petugas / Staff: exact names separated by comma, semicolon, or pipe.
- Catatan / Note.

One daily summary row per date is supported. An import for an existing date replaces that date's current revenue, expenses, and roster. Review the report after import.

## Profit share formula
- Net = revenue - expenses
- Sunset Venue = net × 25%
- Adat = net × 25%
- Staff pool = net × 50%
- Each attendant = staff pool ÷ number of attendants on duty

If historical records have no staff roster, the 50% staff pool can still be calculated, but individual staff shares cannot be allocated until the roster is filled.

## Security notes
- Row Level Security is enabled by `schema.sql`.
- Staff can sign in and enter/edit daily records.
- Only Admin can import historical data or delete daily records.
- Admin can read import history and manage staff.
- Create staff accounts only through the Supabase Auth dashboard. Do not enable public self-registration for this internal tool.
- Before production, test roles using one admin and one staff account.
