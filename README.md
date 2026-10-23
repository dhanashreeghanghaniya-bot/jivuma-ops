# Juma Food Products — Sales & Distribution Ops Platform

Sales and distribution operations for Juma Food Products across Gujarat, covering the
chain Company → Super Stockist → Distributor → Retailer.

`SPEC.md` is the source of truth for scope and phasing. **Phases 1–6 (Foundation, Geography & partners, Leads, Salesman field app, Orders, Expenses & approvals) are complete.**

## Layout

```
apps/api        Express + TypeScript API (port 4000, all routes under /api/v1)
apps/web        Next.js App Router frontend (port 3000)
packages/shared Enums, Zod schemas and Gujarat district constants shared by both
```

## Prerequisites

- Node.js 20+ (this machine runs 24.22.0 from `C:\tools\nodejs`)
- pnpm 12 (`corepack enable pnpm`)
- A Supabase project (the only database; there is no local Postgres)

## First run

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# fill DATABASE_URL / DIRECT_URL from Supabase (see below)
pnpm db:deploy               # apply committed migrations to Supabase
pnpm db:seed
pnpm dev                      # API on :4000, web on :3000
```

Generate real secrets for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` before deploying
anywhere; the committed example values are placeholders.

## Database

The Prisma datasource takes two URLs, which is the split Supabase expects:

- `DATABASE_URL` — pooled connection, used by the running API
- `DIRECT_URL` — direct connection, used by `prisma migrate` and `prisma db seed`

### Supabase

Take both strings from **Project settings → Database → Connection string** and keep the
pooler flags, which Prisma needs because PgBouncer runs in transaction mode and does not
support prepared statements:

```ini
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
```

Use the **pooler** hosts for both. The direct `db.<ref>.supabase.co` host is IPv6-only and
unreachable from most networks.

Data access goes through the Express API only — no Supabase Auth and no Supabase JS client
in the browser. The service-role key belongs in the API's env and must never reach the
frontend.

Supabase also serves the `public` schema over its REST API to anyone holding the (public)
anon/publishable key. The `lock_down_supabase_data_api` migration closes that: RLS is on for
every table with no policies, and the `anon` / `authenticated` roles have no grants, now or on
tables added later. The API connects as the table owner and is unaffected. The Supabase
security advisor will list "RLS enabled, no policy" for each table — that is the intent.

### Photo storage

Field photos (visits, odometer) go to a private Supabase Storage bucket, `juma-files`
(JPEG/WebP only, 5 MB per file). The API hands out signed upload URLs and 5-minute signed
read URLs; the browser never holds a storage key. Set the **secret** key (Project Settings →
API Keys; `sb_secret_…`, or the legacy `service_role` key) in `apps/api/.env`:

```ini
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_STORAGE_BUCKET=juma-files
```

The bucket itself is not created by a migration. On a new project, create it once from the
SQL editor:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('juma-files', 'juma-files', false, 5242880, array['image/jpeg','image/webp']);
```

Without the key the field app keeps working: visits and orders sync, and photos wait on the
phone (shown as "waiting to upload") until the key is set.

### Behind a TLS-intercepting proxy

On a corporate network that re-signs TLS, Prisma cannot download its query engine. Export
the Windows trust store once and point Node at it:

```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\dev\juma-ops\.certs\windows-ca-bundle.pem"
```

The API needs the same variable at runtime to reach Supabase Storage for photo uploads.

`.certs/` is gitignored because the bundle is machine-specific. The web build itself needs
no network access — fonts are system fonts by design.

## Google Maps

The admin dashboard renders the Gujarat coverage map with the Maps JavaScript API. Set
both values in `apps/web/.env.local`:

```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=...
```

In Google Cloud:

1. Enable **Maps JavaScript API** and **Places API (New)**.
2. Create a **browser key**, restricted by HTTP referrer (`localhost:3000` plus the
   production domain) and to those two APIs only.
3. Create a **Map ID** (vector or raster) — Advanced Markers require one.
4. Set a **billing budget alert** so a runaway key cannot cost real money.

The key is public by design and is only ever used from the browser; the server never calls
Google APIs with it.

### District boundaries

The choropleth needs a Gujarat district boundary file at
`apps/web/public/geo/gujarat-districts.geojson`, where each feature carries a `code`
property matching the district codes in the database (`RJT`, `JMN`, …).

Both pieces degrade gracefully, so the dashboard is never a dead screen:

| Missing | What you get |
| --- | --- |
| API key | A clickable district grid coloured by coverage; the side panel, KPIs and filters all still work |
| GeoJSON only | The live map with one coloured circle per district instead of filled boundaries |

Either way an explanatory banner appears under the map saying which file or key to add.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the API and web dev servers together |
| `pnpm build` | Type-checked production build of all three packages |
| `pnpm typecheck` / `pnpm lint` | Static checks across the workspace |
| `pnpm test` | Vitest suite (API) |
| `pnpm db:deploy` | Applies committed migrations to Supabase |
| `pnpm db:migrate` | Creates a new migration after a schema change |
| `pnpm db:seed` | Idempotent demo data — safe to re-run |
| `pnpm db:studio` | Prisma Studio |

## Seeded logins

Password for all three is `Juma@12345` (override with `SEED_DEFAULT_PASSWORD`).

| Role | Phone |
| --- | --- |
| Admin | `+919812300001` |
| Salesman (Ramesh Chauhan) | `+919812300002` |
| Salesman (Suresh Makwana) | `+919812300003` |

The seed covers all 33 Gujarat districts, 18 towns, 4 super stockists, 3 distributors,
13 retailers, 8 leads, 10 company and SS → distributor orders (one cancelled), and roughly two weeks of work days, visits, GPS pings, orders and
TA/DA claims — enough to exercise every coverage state (COVERED, SS_ONLY, LEADS_ONLY,
UNTOUCHED).

## Orders

One table carries all three levels of the chain (company → super stockist → distributor →
shop). Field orders arrive with salesmen's visits; the admin places the rest from **Orders →
New order**. Every order is priced on the server from the product list at its level's tier
(SS price, distributor price, retailer price); a line is whole cases plus loose units, and
keeps the rate it was placed at when prices change later. Order numbers are `JF-YYMM-####`,
sequential per IST month.

Status runs Placed → Confirmed → Dispatched → Delivered. The admin can skip ahead (record a
delivery that was never confirmed) but never go back, and can cancel anything not yet
delivered, with a reason. Every change is logged with who and when, and concurrent changes
cannot both win. A distributor can only buy from its own super stockist.

## Expenses & approvals

- **Allowance policy** (Settings → Allowance policy) is versioned by effective date. A claim
  is always judged by the version in force on its own date, so changing rates never
  re-prices old claims. New versions start today at the earliest.
- **End Day drafts TA/DA**: DA by day type (none on leave/holiday, and none for a day with no
  visits when the policy says so); TA as km × the rate for the vehicle the salesman picks.
  Bus and train are claimed at the fare with a ticket photo.
- Salesmen add fares, lodging, food, phone and other claims with bill photos (offline too).
  Claims for a day go for approval when the day is submitted; others are submitted on their
  own.
- **Expenses** (admin) is the approval queue: each claim shows its bills, the policy limit
  and flags (above policy, no bill, km above the day, duplicate). Approve, part-approve or
  reject with a remark, or bulk-approve everything without a flag. Submitted work days can
  be approved, rejected or reopened for changes.
- Salesmen and admins get in-app notifications (bell icon) for submissions and decisions.

## Payroll cost reports

- **Settings → Salaries**: monthly salary (basic + HRA + fixed allowance) by revision date;
  a month uses the revision in force on its last day.
- **Reports → Monthly cost**: generate a month for every active salesman (and anyone who
  worked that month): salary + approved TA, DA and other expenses + incentives − deductions,
  with visits, orders, new shops and cost-to-sales. Drafts can be regenerated and keep the
  admin's deductions; Final and Paid reports are frozen. Finalising with claims still pending
  needs a second click, because a claim approved after its month is finalised is not added to
  any statement.
- PDF statement per salesman (amounts shown as "Rs." since the built-in PDF fonts have no ₹
  glyph) and one Excel sheet for all salesmen. Salesmen see their statement under Profile →
  My month once it is final.

## Analytics

**Reports** also has:
- **Sales**: order value by district, town, distributor or product, month on month (up to 24
  months), for secondary (distributor → shop), SS → distributor or primary (company → SS)
  orders; cancelled orders excluded. Change is the last month over the one before.
- **Coverage**: every district's status, towns covered out of total, partner and lead counts,
  and this month's secondary sales.
- **Lead funnel**: leads by stage with expected investment, and conversion by type, source and
  salesman, for leads created in a date range.

Sales and coverage export to Excel. All reports are admin-only.

## Bulk import

**Settings → Bulk import** loads towns, super stockists, distributors, retailers and leads
(and updates districts) from an Excel (.xlsx) or CSV file, up to 5,000 rows. Download the
Excel template for the chosen type: fill in the Data sheet (yellow headers are required, every
cell is text so phone numbers and GSTINs stay as typed); the Columns sheet explains each
column with an example. Only the first sheet of an uploaded workbook is read. Every row is
checked first and the preview shows what will be created, updated or skipped and why; nothing
is written until you press Import. Coverage is recomputed afterwards.

## Sales team

**Sales team** (admin) is the field-force view:
- **Today**: who has started, where they are, visits, orders and km so far, plus a list of
  flags from the last 7 days: check-in far from the shop, a day with no visits, odometer km
  above 1.3x the GPS km, a day never ended, and gaps of 2 hours or more between positions.
- **Salesman → Calendar**: a month with each day worked, still open, on leave, a holiday or
  absent. Click a day to open it.
- **Salesman → Date range**: towns and shops visited, orders and expenses for up to 92 days,
  with an Excel export (one sheet each).
- **Salesman → Territory & beats**: tick the districts a salesman covers and build beats
  (an ordered list of shops, optionally tied to a weekday).
- **Day detail**: the day's route replayed on a drawn map (numbered visit markers, play and
  slider), a timeline with gaps and flags, and the day's km, visits, orders and claims.

## Audit log

**Settings → Audit log** lists every create, update and delete on partners, leads, orders,
expenses, work days, users, policies and reports: who did it and when. Filter by record type,
action, user or date; open a row to see each changed field before and after. Orders, partners
and work days link to their page. Passwords are never written to the log.

## Salesman field app (PWA)

The salesman UI at `/app` is an installable PWA. Work recorded in the field (visits with
orders and photos, new shops, leads, GPS pings) goes into an outbox in IndexedDB first and
syncs automatically when the phone has signal; every item carries a client UUID so a retry
never creates a duplicate. The salesman's territory (towns, shops, distributors, products,
beats) is cached on the phone after the first load. Starting and ending the day need signal:
both take their time from the server clock and their position from the phone, by design.

- The service worker is only built for production. To test offline behaviour run
  `pnpm build` then `pnpm --filter @juma/web start`, not `pnpm dev`.
- Geolocation, the camera and the service worker all require a secure context. `localhost`
  counts; a phone on your LAN hitting `http://192.168.x.x:3000` does not. To try it on a real
  phone, use an HTTPS tunnel or a deployed preview.
- Location is recorded every 10 minutes only while the app is open on screen, plus on every
  visit, order and lead. Background tracking needs the native app (SPEC 10).

## Conventions

- All reads and writes go through the Express API. The browser never talks to the database.
- Money is `Decimal(12,2)`, never float. Timestamps are stored UTC and displayed IST.
- Phone numbers are stored E.164 (`+91XXXXXXXXXX`) and displayed as `98XXX XXXXX`.
- Every response uses the `{ data, error, meta }` envelope.
- Authorization is enforced in the API, not just in the UI.
