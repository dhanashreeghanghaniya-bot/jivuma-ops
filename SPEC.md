# Juma Food Products — Sales & Distribution Ops Platform

## Master build prompt

> Build **one phase at a time**. Do not jump ahead.

---

## 0. Context

Juma Food Products sells FMCG food products across Gujarat through this chain:

```
Company (Juma) → Super Stockist (SS) → Distributor → Retailer (shop)
```

Not all 33 districts of Gujarat are covered yet. The owner needs one system to:

1. See **on a map of Gujarat** which districts/towns have distribution, which only have leads, and which are untouched.
2. Track **SS, distributors, retailers and leads** with full contact details.
3. Track **orders** moving down the chain.
4. Manage a **field sales team**: daily routes, shop visits, photos, orders taken, attendance.
5. Have salesmen **submit expense claims (TA/DA)** from their phone and generate **monthly cost reports** (salary + TA + DA + incentives) for the owner.

Two roles for now: **Admin** (owner — sees and controls everything) and **Salesman** (field user — sees only his own data and assigned territory). Design the role system so a **Manager / ASM** role can be added later without refactoring.

The salesman side will be used on phones in the field, often with weak network. A native mobile app comes later; for now the salesman UI must be a **mobile-first PWA** (installable, works on 4G/3G, camera + GPS access).

---

## 1. Tech stack (use exactly this)

**Monorepo** (pnpm workspaces + Turborepo):

```
/apps/api        → Node.js + Express + TypeScript (REST API)
/apps/web        → Next.js 14+ (App Router) + TypeScript (admin + salesman PWA)
/packages/shared → shared TS types, Zod schemas, constants (districts, enums)
```

Why a separate API instead of Next.js route handlers: the future React Native app must reuse the exact same API. Keep all business logic in `/apps/api`.

- **DB: Supabase (managed PostgreSQL), Mumbai region**, accessed only through Prisma from `/apps/api`.
  - Use Supabase purely as Postgres + Storage. Do **not** use Supabase Auth, Row Level Security, or the Supabase JS client for data access from the frontend. All reads and writes go through the Express API.
  - Prisma config: `DATABASE_URL` = pooled connection string (port 6543, `?pgbouncer=true&connection_limit=1`), `DIRECT_URL` = direct connection (port 5432) used by `prisma migrate`. Set `directUrl = env("DIRECT_URL")` in `schema.prisma`.
  - Local dev: Postgres in Docker Compose (or Supabase CLI local stack), same Prisma schema.
  - Store lat/lng as `Decimal(9,6)`. PostGIS (available in Supabase) is optional later for radius queries.
- **Validation:** Zod, schemas shared from `/packages/shared` between API and web.
- **Auth:** JWT access token (15 min) + refresh token (httpOnly cookie, 30 days). Login by **mobile number + password**. Passwords hashed with bcrypt. (Phone OTP is a later phase.) Role-based middleware: `requireRole('ADMIN')`.
- **Frontend UI:** Tailwind CSS + shadcn/ui. TanStack Query for data fetching. React Hook Form + Zod.
- **Map: Google Maps JavaScript API** via `@vis.gl/react-google-maps` (the official React wrapper).
  - Wrap the app's map pages in `<APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>`. Render maps client-side only.
  - Use a **Map ID** (`NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`) so we can use **Advanced Markers** (`<AdvancedMarker>` + `<Pin>`) with custom colours and icons per marker type.
  - **District choropleth:** load the Gujarat district boundary GeoJSON (`/apps/web/public/geo/gujarat-districts.geojson`) into the map's **Data layer** (`map.data.addGeoJson`). Style each feature with `map.data.setStyle(feature => …)` using the district's `coverageStatus` from the API. Match GeoJSON features to DB districts by a `code` property. If the GeoJSON is unavailable, fall back to one coloured circle marker per district.
  - **Clustering:** `@googlemaps/markerclusterer` for retailer markers.
  - **Route replay:** draw with `google.maps.Polyline`, with numbered Advanced Markers for each check-in.
  - **Places:** use **Places API (New)** Place Autocomplete on the "add new shop", "add lead" and partner forms. Restrict to country `in`, bias results to the salesman's current GPS location, and fill address, lat and lng from the selected place. The salesman can still drag the pin to the exact shop.
  - **Navigation:** "Navigate" buttons open a plain Google Maps deep link (`https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`). Do **not** use the paid Directions API.
  - Restrict the map viewport to Gujarat bounds (`south 20.0, west 68.0, north 24.8, east 74.6`) with `restriction.strictBounds = false`.
  - Required Google Cloud setup (list it in the README): enable **Maps JavaScript API** and **Places API (New)**, create a browser key restricted by HTTP referrer (localhost + production domain) and to those two APIs only, create a Map ID, and set a billing budget alert.
- **File uploads (photos, bills):** **Supabase Storage**, in a private bucket. The API issues signed upload URLs (`createSignedUploadUrl`) using the service-role key, which lives only on the server. The API also issues short-lived signed read URLs for viewing. Never expose the service-role key to the browser. Folder layout: `visits/{salesmanId}/{yyyy-mm}/…`, `bills/{salesmanId}/{yyyy-mm}/…`, `odometer/…`, `shops/…`. Compress images client-side before upload (max 1600px, ~70% JPEG) — field photos must not eat salesman data.
- **Reports export:** Excel via `exceljs`, PDF via `@react-pdf/renderer` or `pdfkit` on the API.
- **PWA:** `next-pwa` (or Serwist). Offline queue for visit/expense submissions using IndexedDB (`idb-keyval`), auto-sync when online.
- **Testing:** Vitest for API services; Playwright smoke tests for the two main flows (admin map, salesman day).
- **Dev:** Docker Compose for Postgres. `.env.example` in each app. ESLint + Prettier.
- **Language/locale:** UI in English first, but all strings go through a simple i18n layer (`en`, `gu`) so Gujarati can be added. Currency INR, format `₹1,23,456`. Dates `DD-MM-YYYY`, timezone `Asia/Kolkata`.

---

## 2. Domain model (Prisma)

Build these models. Every table gets `id (cuid)`, `createdAt`, `updatedAt`. Use soft delete (`deletedAt`) on master data — never hard-delete distributors, retailers, or anything with orders/expenses attached.

### 2.1 Geography

- **District** — `name`, `nameGu`, `code`, `lat`, `lng`, `zone` (Saurashtra / Kutch / North / Central / South Gujarat), `coverageStatus` (computed, see §4.1). Seed all 33 Gujarat districts.
- **Town** — `name`, `districtId`, `lat`, `lng`, `type` (CITY / TOWN / VILLAGE), `population?`. Towns are where leads and retailers actually sit.

### 2.2 Channel partners

- **SuperStockist** — `firmName`, `ownerName`, `phone`, `altPhone`, `email?`, `gstin?`, `address`, `townId`, `lat?`, `lng?`, `coveredDistricts` (many-to-many District), `status` (ACTIVE / INACTIVE / ON_HOLD), `onboardedAt`, `notes`.
- **Distributor** — same contact fields + `superStockistId`, `coveredTowns` (many-to-many Town), `creditLimit?`, `creditDays?`, `status`.
- **Retailer** — `shopName`, `ownerName`, `phone`, `address`, `townId`, `lat`, `lng`, `distributorId`, `category` (KIRANA / SUPERMARKET / GENERAL / HORECA / OTHER), `photoUrl?`, `addedBySalesmanId?`, `isVerified` (admin approves salesman-added shops).
- **Lead** — prospective SS or distributor for a place.
  `type` (SS / DISTRIBUTOR / RETAILER), `name`, `firmName?`, `phone`, `townId`, `districtId`, `source` (FIELD / REFERRAL / INBOUND_CALL / EXPO / OTHER), `stage` (NEW → CONTACTED → MEETING_DONE → NEGOTIATION → WON / LOST), `lostReason?`, `assignedToId?`, `expectedInvestment?`, `followUpAt?`, `notes`.
  **LeadActivity** — `leadId`, `userId`, `type` (CALL / VISIT / NOTE / STAGE_CHANGE), `note`, `at`.
  When a lead is marked **WON**, offer a one-click "Convert to SS / Distributor / Retailer" that creates the partner record pre-filled.

### 2.3 Products & orders

- **Product** — `name`, `sku`, `category`, `packSize`, `unitsPerCase`, `mrp`, `ssPrice`, `distributorPrice`, `retailerPrice`, `isActive`.
- **Order** — one table for all levels:
  `level` (COMPANY_TO_SS / SS_TO_DISTRIBUTOR / DISTRIBUTOR_TO_RETAILER),
  `fromPartyType/fromPartyId`, `toPartyType/toPartyId` (polymorphic; use explicit nullable FKs `superStockistId`, `distributorId`, `retailerId` rather than a generic id so Prisma relations work),
  `orderNumber` (human readable, e.g. `JF-2610-0042`), `status` (PLACED → CONFIRMED → DISPATCHED → DELIVERED / CANCELLED), `totalAmount`, `takenBySalesmanId?`, `visitId?`, `orderDate`, `expectedDelivery?`, `notes`.
  **OrderItem** — `orderId`, `productId`, `qtyCases`, `qtyUnits`, `rate`, `amount`.
  **OrderStatusLog** — every status change with user + timestamp.

### 2.4 Field force

- **User** — `name`, `phone` (unique, login id), `passwordHash`, `role` (ADMIN / SALESMAN; enum ready for MANAGER), `isActive`, `photoUrl?`, `joiningDate`, `hqTownId` (headquarter — needed for DA rules), `reportingToId?`.
- **SalesmanTerritory** — salesman ↔ districts/towns assigned.
- **Beat** (planned route) — `name`, `salesmanId`, `dayOfWeek?`, ordered list of towns/retailers (**BeatStop**: `beatId`, `townId?`, `retailerId?`, `sequence`).
- **WorkDay** (attendance + day log) — `salesmanId`, `date` (unique per salesman per day), `startAt`, `startLat/Lng`, `startOdometer?`, `startOdometerPhotoUrl?`, `endAt`, `endLat/Lng`, `endOdometer?`, `endOdometerPhotoUrl?`, `dayType` (HQ / EX_HQ / OUTSTATION / LEAVE / HOLIDAY), `beatId?`, `townsVisited` (many-to-many Town), `totalKm` (from odometer, else from GPS distance), `status` (OPEN / SUBMITTED / APPROVED / REJECTED), `remarks`.
- **WorkDay** also stores `startAccuracyM`, `endAccuracyM`, `startPlaceLabel`, `endPlaceLabel` (reverse-geocoded), `endedProperly` (bool), `workingMinutes` (computed).
- **LocationPing** — `workDayId`, `salesmanId`, `lat`, `lng`, `accuracyM`, `source` (START / END / TIMER / VISIT / ORDER / LEAD / EXPENSE), `capturedAt` (device time), `receivedAt` (server time), `battery?`. Index on (`salesmanId`, `capturedAt`).
- **Visit** — `workDayId`, `salesmanId`, `retailerId?` OR new-shop info, `distributorId?`, `leadId?`, `townId`, `checkInAt`, `checkInLat/Lng`, `checkOutAt?`, `distanceFromShopMeters` (computed vs retailer's saved location — flag if > 300 m), `outcome` (ORDER_TAKEN / NO_ORDER / SHOP_CLOSED / FOLLOW_UP / NEW_SHOP_ADDED), `noOrderReason?`, `orderId?`, `notes`.
  **VisitPhoto** — `visitId`, `url`, `type` (SHELF / SHOP_FRONT / DISPLAY / OTHER), `capturedAt`, `lat/lng`.

### 2.5 Expenses & payroll

- **ExpenseClaim** — `salesmanId`, `workDayId?`, `date`, `category` (TA / DA / LODGING / FOOD / PHONE / MISC), `travelMode?` (BIKE / CAR / BUS / TRAIN / AUTO), `fromTownId?`, `toTownId?`, `km?`, `amountClaimed`, `amountApproved?`, `billPhotoUrls[]`, `status` (DRAFT / SUBMITTED / APPROVED / PARTIALLY_APPROVED / REJECTED), `adminRemark?`, `reviewedById?`, `reviewedAt?`.
- **AllowancePolicy** (admin-configurable, versioned with `effectiveFrom`) — DA per day by `dayType` (HQ / EX_HQ / OUTSTATION), TA rate per km by `travelMode`, max lodging per night, monthly phone allowance, whether bus/train TA needs a bill.
- **SalaryStructure** — `salesmanId`, `basic`, `hra`, `fixedAllowance`, `effectiveFrom`.
- **Incentive** — `salesmanId`, `month`, `amount`, `reason`.
- **MonthlyCostReport** (generated, snapshot) — `salesmanId`, `month`, `workingDays`, `leaves`, `salary`, `taTotal`, `daTotal`, `otherExpenses`, `incentives`, `deductions`, `grandTotal`, `ordersCount`, `orderValue`, `visitsCount`, `newRetailers`, `costToSalesRatio`, `status` (DRAFT / FINAL / PAID), `generatedAt`, `pdfUrl?`.

### 2.6 System

- **AuditLog** — `userId`, `action`, `entity`, `entityId`, `before`, `after`, `at`. Log every create/update/delete on partners, orders, expenses, and reports.
- **Notification** — `userId`, `title`, `body`, `link`, `readAt`.

---

## 3. Seed data

Seed all **33 districts** of Gujarat with name, Gujarati name, zone and approximate centre coordinates. Then seed these as **covered** (with one demo SS and one demo distributor each, plus a few retailers and leads with dummy names and `98xxxxxxxx` numbers):

| District | Lat | Lng |
|---|---|---|
| Rajkot | 22.3039 | 70.8022 |
| Junagadh | 21.5222 | 70.4579 |
| Jamnagar | 22.4707 | 70.0577 |

Add 2–3 towns per covered district (e.g. Rajkot: Rajkot city, Gondal, Jetpur, Dhoraji; Junagadh: Junagadh city, Keshod, Manavadar; Jamnagar: Jamnagar city, Dhrol, Kalavad). Add a couple of **leads** in uncovered districts (e.g. Porbandar, Amreli, Morbi) so the map shows all three states. Seed 1 admin and 2 salesmen, 5 products, an `AllowancePolicy`, and ~2 weeks of fake work days, visits, orders and expenses so every screen has data.

Also build an **admin bulk import** (CSV/Excel upload with a downloadable template) for districts, towns, SS, distributors, retailers, and leads. The owner will load real data this way — validate every row, show a preview with errors highlighted, then commit.

---

## 4. Admin (owner) — features & screens

Desktop-first, responsive. Left sidebar navigation.

### 4.1 Dashboard / Gujarat Map (home screen)

- Full-height Google Map centred on Gujarat (`{ lat: 22.5, lng: 71.5 }`, zoom 7), restricted to Gujarat. Include a map/satellite toggle.
- **District choropleth** (from GeoJSON) coloured by coverage status, computed server-side:
  - **Covered** — has ≥1 active distributor
  - **SS only** — has SS but no distributor
  - **Leads only** — no partner, but open leads
  - **Untouched** — nothing
- **Advanced Markers** layered on top, each layer toggleable and each type with a distinct pin colour and icon: SS, distributors, retailers (clustered with `@googlemaps/markerclusterer`), open leads, and today's salesman check-ins.
- **Click a district** → right side panel (sheet) showing:
  - Coverage status, towns list with per-town coverage
  - SS and distributors: firm, owner, **phone (tap-to-call / WhatsApp link)**, address, status, last order date
  - Open leads with stage, follow-up date, assigned salesman
  - Counts: retailers, orders this month, order value this month
  - Assigned salesmen
  - Buttons: "Add lead here", "Add distributor here"
- **Click a marker** → popup with contact card + link to full detail page.
- Top KPI strip: districts covered / 33, active distributors, active retailers, open leads, orders this month (₹), salesmen in field today.
- Filters: zone, product category (later), date range for order metrics.

### 4.2 Partners

List + detail pages for SS, Distributors, Retailers. Search, filter by district/town/status. Detail page: contact info, map pin (draggable to correct location), linked downstream partners, order history, visit history, notes. Retailers added by salesmen land in a **"To verify"** queue.

### 4.3 Leads (pipeline)

- Kanban by stage + table view. Filter by type, district, assigned salesman, follow-up due.
- Lead detail with activity timeline. "Overdue follow-ups" widget on dashboard.
- Convert WON lead → partner.

### 4.4 Orders

- Table of all orders, filter by level, party, district, status, date, salesman.
- Create order (admin can place COMPANY_TO_SS orders). Update status with log.
- Order detail with items and status timeline.

### 4.5 Sales team

- Salesmen list: today's status (not started / in field / day ended), visits today, orders today.
- **Live today view:** every salesman's start location and time, latest ping, visits done, and whether he has ended the day. Shown as a list and on the map.
- **Salesman history** (salesman detail page):
  - **Calendar** of past months. Each day is coloured: worked / leave / holiday / absent / not ended properly. Shows start time, end time and hours worked.
  - **Day detail** (click any past date):
    - A map with the start point, end point and a polyline through all pings, visits and orders in time order. Numbered markers, with a playback slider to replay the day.
    - A **timeline** next to it: 9:12 started at Rajkot → 10:05 visit at Shree Kirana, Gondal (order ₹4,200, 2 photos) → 11:40 added lead → … → 7:30 ended at Jetpur. Gaps and flags are marked inline.
    - Day totals: km (odometer vs GPS), visits, orders, ₹ value, new shops, leads, TA/DA claimed.
  - **Range view:** pick any date range to see all towns visited, all shops visited, orders and expenses for that period, exportable to Excel.
  - Profile, territory and beats, as before.
- History is never deleted. Admin can view any past day for any salesman, including deactivated ones.
- Assign territory and beats.
- Flag list: visits where check-in was > 300 m from shop's saved location, days with no visits, odometer km far above GPS km.

### 4.6 Expenses & approvals

- Queue of SUBMITTED work days and expense claims. Show bill photos inline, policy limit next to claimed amount, auto-flag claims above policy.
- Approve / partially approve (edit amount) / reject with remark. Bulk approve.
- Salesman gets a notification.

### 4.7 Reports

- **Monthly cost report per salesman** (generate for a month → review → mark FINAL → mark PAID): salary + TA + DA + other expenses + incentives − deductions = total. Also shows performance (visits, orders, order value, new retailers) and **cost-to-sales ratio**. Export PDF (one per salesman) and Excel (all salesmen in one sheet).
- Sales by district / town / distributor / product, month-on-month.
- Coverage report: district-wise status, towns covered vs total.
- Lead funnel report.

### 4.8 Settings

- Users (create salesman, reset password, deactivate).
- Allowance policy, salary structures.
- Products.
- Districts & towns (edit coordinates).
- Bulk import.

---

## 5. Salesman — mobile PWA screens

Mobile-first, big touch targets, minimal typing, bottom tab bar: **Today · Visits · Orders · Expenses · Profile**. Must work on a cheap Android phone on 3G.

### 5.1 Day flow (the core loop)

1. **Start Day** — a single big "Start Day" button. Location is **mandatory**:
   - On tap, request the device location (`navigator.geolocation.getCurrentPosition`, `enableHighAccuracy: true`, 15 s timeout).
   - If permission is denied or location is off, block the start. Show clear Gujarati/English steps to turn on location, and a "Try again" button.
   - If accuracy is worse than 200 m, retry up to 3 times. If it's still poor, allow the start but save the accuracy value and flag the day for admin.
   - Save start time from the **server clock**, never the phone clock, plus lat, lng, accuracy, and the reverse-geocoded town.
   - Then choose day type (HQ / Ex-HQ / Outstation), choose beat (optional), and add odometer reading + photo (optional).
   - Nothing else in the app works until the day is started: no visits, orders or leads.
   - Only one open day per salesman. If yesterday's day was never ended, force him to end it first; it's auto-marked "not ended properly" and flagged.
2. **Today screen** — planned beat stops in order, visits done so far, orders value today, "+ New Visit" button.
3. **New Visit** —
   - Pick district → town → retailer (searchable; nearest retailers by GPS shown first), or **"Add new shop"**: name, owner, phone, category, shop photo, plus a **Google Places autocomplete** search to fill address and location. A small map shows the pin at the salesman's current GPS; he can drag it onto the exact shop. If no Place matches, use GPS only.
   - Each retailer card has a **Navigate** button that opens Google Maps directions via deep link.
   - Auto check-in GPS + time.
   - Outcome: Order taken / No order (reason) / Shop closed / Follow-up.
   - If order: product picker with quantity steppers (cases/units), auto total, choose distributor who will deliver.
   - Photos: shelf / display / shop front (camera capture only, not gallery, timestamp + GPS stamped).
   - Notes. Save.
4. **Add lead** from anywhere (for a new distributor/SS prospect in a town).
5. **Location pings during the day** — while a day is open and the app is open on screen, record the device location every 10 minutes and on every visit, order, lead or expense action. Store each in **LocationPing**. Be honest in the UI: the PWA cannot track when the app is closed or the screen is off (needs the native app later). Gaps longer than 2 hours during working hours are shown as gaps in history and flagged.
6. **End Day** — location is **mandatory**, same rules as Start Day. End time is from the server clock. Then odometer + photo, summary (visits, orders, ₹, km), auto-drafted TA/DA from policy (DA by day type, TA = km × rate for own vehicle). Salesman adds other expenses with bill photos → **Submit**. Once submitted, the day is locked (admin can reopen).

### 5.2 Other salesman screens

- **Visits** — history by date.
- **Orders** — orders he took, with status.
- **Expenses** — monthly view: claimed vs approved, status of each, rejection remarks. Add ad-hoc expense.
- **My month** — salary slip preview once admin marks report FINAL.
- **Profile** — change password, logout.

### 5.3 Offline behaviour

- Visits, orders, leads, expenses created offline are queued in IndexedDB with a client-generated UUID (idempotency key) and synced automatically when online. Show a "3 items pending sync" badge.
- Photos queue too; upload when online.
- Cache retailers, products and towns for his territory locally after login.

---

## 6. API design

REST, versioned under `/api/v1`. JSON. Consistent envelope `{ data, error, meta }`. Pagination via `?page&limit`. All list endpoints support filters used by the UI.

Key groups:

```
POST   /auth/login, /auth/refresh, /auth/logout
GET    /me

GET    /geo/districts            (with coverageStatus + counts)
GET    /geo/districts/:id/summary (everything for the map side panel)
CRUD   /geo/towns

CRUD   /super-stockists, /distributors, /retailers
POST   /retailers/:id/verify
CRUD   /leads, POST /leads/:id/activities, POST /leads/:id/convert

CRUD   /products
CRUD   /orders, POST /orders/:id/status

POST   /workdays/start, POST /workdays/:id/end, POST /workdays/:id/submit
GET    /workdays (admin: all; salesman: own)
POST   /visits, GET /visits
POST   /uploads/presign

CRUD   /expenses, POST /expenses/:id/review
GET/PUT /settings/allowance-policy
CRUD   /salary-structures, /incentives

POST   /reports/monthly-cost/generate?month=YYYY-MM
GET    /reports/monthly-cost?month=..., GET /reports/monthly-cost/:id/pdf
GET    /reports/monthly-cost/export.xlsx?month=...
GET    /reports/sales, /reports/coverage, /reports/leads

POST   /import/:entity/preview, POST /import/:entity/commit
```

Authorization rules (enforce in API, not just UI):

- Salesman can only read/write his own work days, visits, expenses, and only see partners/leads in his assigned territory.
- Salesman cannot edit a submitted day or an approved expense.
- Only admin can approve expenses, generate reports, change policy, delete/deactivate anything.

---

## 7. Business rules

- **Coverage status** is computed, not hand-set (see §4.1). Recompute on partner create/update/status change.
- **DA** = policy rate for that day's `dayType`; no DA on LEAVE/HOLIDAY; no DA if day has zero visits (configurable).
- **TA (own vehicle)** = km × policy rate for `travelMode`. Km from odometer; if missing, from GPS distance between check-ins. Flag if odometer km > 1.3 × GPS km.
- **TA (public transport)** = actual with bill photo required.
- **Monthly cost report** only includes APPROVED expenses. Regenerating a DRAFT report overwrites it; FINAL/PAID reports are frozen.
- Order numbers are sequential per month: `JF-YYMM-####`.
- All money as `Decimal(12,2)`, never float.
- All timestamps stored UTC, displayed IST.

---

## 8. Non-functional

- Google Maps cost control: load the Maps script once per session (not per page), don't create Place Autocomplete sessions until the input is focused, debounce autocomplete input (300 ms), and never call Google APIs from the server with the browser key.
- Security: helmet, CORS allowlist, rate limit on `/auth/*`, input validated with Zod on every route, signed upload/read URLs expire in 5 min, Supabase service-role key only in the API's env, no PII in logs.
- Performance: the map endpoint must return district summaries in one call (< 300 ms with seed data). Retailer markers clustered.
- Phone numbers stored E.164 (`+91XXXXXXXXXX`), displayed as `98XXX XXXXX`.
- Every list screen has empty, loading and error states.
- Mobile salesman screens must be usable one-handed at 360 px width.

---

## 9. Build phases (do them in order; stop after each and let me test)

**Phase 1 — Foundation**
Monorepo, Docker Postgres, Prisma schema (all models), seed script, auth (login/refresh/roles), admin layout + salesman layout shells, Settings → Users.

**Phase 2 — Geography, partners, map**
Districts/towns, SS/distributors/retailers CRUD, coverage computation, **Gujarat map dashboard with district panel**, bulk import.

**Phase 3 — Leads**
Lead CRUD, pipeline kanban, activities, follow-ups, convert-to-partner, leads on map.

**Phase 4 — Salesman field app**
PWA setup, start/end day, visits with GPS + photos, add new shop, add lead, order taking, offline queue.

**Phase 5 — Orders**
Full order management across all three levels, status timeline, admin order screens.

**Phase 6 — Expenses & approvals**
Allowance policy, auto TA/DA drafting at end of day, expense claims with bills, admin approval queue, notifications.

**Phase 7 — Payroll cost reports & analytics**
Salary structures, incentives, monthly cost report generation, PDF/Excel export, sales/coverage/lead reports, salesman route replay, flags.

**Phase 8 — Hardening**
Audit log UI, Playwright tests, Gujarati i18n, deployment (API on Railway/Render, web on Vercel, DB + Storage on Supabase). Before go-live, move Supabase to a paid plan so the project never pauses and daily backups are on.

For every phase: write migrations, update seed data, add Zod schemas to `/packages/shared`, and give me a short checklist of what to click to verify it works.

---

## 10. Out of scope for now (design so they can be added later)

- Native mobile app (React Native / Expo) — reuse the same API.
- Distributor / SS logins to place their own orders.
- Inventory / stock at SS and distributor level.
- Payments, invoicing, GST e-invoice, Tally integration.
- Phone OTP login, WhatsApp notifications.
- True background location tracking when the app is closed or the screen is off. This needs the native app (Expo + background location). The PWA only pings while the app is open, plus on every action.
- Schemes / discounts / targets per salesman.
