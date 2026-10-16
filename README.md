# Juma Food Products — Sales & Distribution Ops Platform

Sales and distribution operations for Juma Food Products across Gujarat, covering the
chain Company → Super Stockist → Distributor → Retailer.

`SPEC.md` is the source of truth for scope and phasing. **Phase 1 (Foundation) is complete.**

## Layout

```
apps/api        Express + TypeScript API (port 4000, all routes under /api/v1)
apps/web        Next.js App Router frontend (port 3000)
packages/shared Enums, Zod schemas and Gujarat district constants shared by both
```

## Prerequisites

- Node.js 20+ (this machine runs 24.22.0 from `C:\tools\nodejs`)
- pnpm 12 (`corepack enable pnpm`)
- Docker Desktop, for the Postgres container

## First run

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# point DATABASE_URL / DIRECT_URL at a database (see below)
pnpm db:migrate
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

Nothing else changes, and Docker is not needed at all in this mode.

Data access goes through the Express API only — no Supabase Auth, no Row Level Security,
and no Supabase JS client in the browser. The service-role key belongs in the API's env and
must never reach the frontend.

### Local Docker (optional)

```bash
docker compose up -d          # Postgres 16 on host port 55432
```

The container publishes **55432**, not 5432: host port 5432 is frequently already taken by
a WSL-hosted Postgres that claims loopback through the WSL port relay and silently shadows
Docker's binding. Connecting to 5432 appears to work and then fails password
authentication against someone else's database.

### Behind a TLS-intercepting proxy

On a corporate network that re-signs TLS, Prisma cannot download its query engine. Export
the Windows trust store once and point Node at it:

```powershell
$env:NODE_EXTRA_CA_CERTS = "C:\dev\juma-ops\.certs\windows-ca-bundle.pem"
```

`.certs/` is gitignored because the bundle is machine-specific. The web build itself needs
no network access — fonts are system fonts by design.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs the API and web dev servers together |
| `pnpm build` | Type-checked production build of all three packages |
| `pnpm typecheck` / `pnpm lint` | Static checks across the workspace |
| `pnpm test` | Vitest suite (API) |
| `pnpm db:migrate` | Applies Prisma migrations |
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
13 retailers, 8 leads and roughly two weeks of work days, visits, GPS pings, orders and
TA/DA claims — enough to exercise every coverage state (COVERED, SS_ONLY, LEADS_ONLY,
UNTOUCHED).

## Conventions

- All reads and writes go through the Express API. The browser never talks to the database.
- Money is `Decimal(12,2)`, never float. Timestamps are stored UTC and displayed IST.
- Phone numbers are stored E.164 (`+91XXXXXXXXXX`) and displayed as `98XXX XXXXX`.
- Every response uses the `{ data, error, meta }` envelope.
- Authorization is enforced in the API, not just in the UI.
