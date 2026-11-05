# Sunset Venue Parking

A staff-only daily parking finance tracker for Sunset Venue.

## Current MVP

- Daily entry for total revenue and total expenses.
- Select the staff on duty for each date.
- Automatically calculate net revenue and distribution:
  - Sunset Venue: 25%
  - Adat: 25%
  - Parking staff pool: 50%, split equally among staff on duty that day.
- Dashboard filters: today, this month, all records.
- Reports with custom date range.
- PDF report download.
- WhatsApp sharing: on supported mobile browsers, use the native share sheet to share the generated PDF. If file sharing is unavailable (common on desktop), the PDF downloads and WhatsApp opens with a text summary; attach the downloaded PDF manually.
- Import historical .xlsx, .xls, and .csv files.
- Export a backup .xlsx file.
- Data is currently stored in browser localStorage on the current device/browser.

## Run locally

Open `index.html` in a modern browser, or serve the folder with any static web server.

## Deploy with GitHub Pages

1. Open repository Settings → Pages.
2. Under Build and deployment, choose Deploy from a branch.
3. Select `main` and `/ (root)`, then Save.
4. Wait for the Pages deployment to complete. The app will be available at the repository's GitHub Pages URL.

## Historical import format

The first worksheet must contain a header row. Supported header names (case-insensitive; spaces and punctuation ignored):

| Required | Accepted column names |
|---|---|
| Date | Tanggal, Date, Tgl |
| Revenue | Revenue, Total Revenue, Pendapatan |
| Expenses | Pengeluaran, Expenses, Total Pengeluaran |

Optional:
- Petugas / Staff: exact staff names separated by comma, semicolon, or pipe.
- Catatan / Note.

Use ISO dates (YYYY-MM-DD) where possible to avoid ambiguous day/month parsing. One record per date is supported. Import updates/replaces the existing daily record for the same date; review the import result and exported backup before importing.

## Important current limitations

- This MVP is single-device/local-browser storage. It does not yet sync data between staff devices or provide secure user accounts.
- Browser storage can be cleared. Use Export Backup regularly.
- Excel import expects daily totals, not raw vehicle-level rows. Confirm that historical staff names match the five configured names exactly.
- PDF sharing depends on browser/device support. WhatsApp does not provide a universal browser API for silently attaching a PDF to a chat.
- CDN libraries (SheetJS and jsPDF) require an internet connection.

## Database design for the next connected version

See [schema.sql](./schema.sql). It defines staff, users, daily records, staff duty, revenue/expense line items, and import history for a Supabase/PostgreSQL backend. The current frontend does not connect to this database yet; configure authentication, Row Level Security, and backend integration before using it as a shared live system.

## Profit-sharing rule

For each daily record:

- net = revenue - expenses
- Sunset Venue = net × 25%
- Adat = net × 25%
- staff pool = net × 50%
- each staff member's share = staff pool ÷ number of staff on duty

The daily staff roster is required for new manual entries. Historical imports may have no staff names; in that case, the staff pool can be calculated for the day but cannot be allocated per person until the roster is corrected.
