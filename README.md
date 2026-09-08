# Spotter

A multi-tenant gym SaaS: memberships, monthly dues, payments, expenses, P&L,
location-locked QR attendance, and WhatsApp payment reminders.

## Roles

| Role | Where | Does |
|---|---|---|
| **Admin** | `/admin` | Creates gyms and owner logins; can drill into any gym. |
| **Owner** | `/owner` | Full control of one gym: overview, members, dues, payments, expenses, P&L, employees + granular permissions, reminder templates, check-in QR, activity log, settings. |
| **Employee** | `/employee` | Only the actions the owner granted. Approval-gated actions queue for the owner instead of writing. |
| **Member** | `/m` | Completes their profile, sees dues + payments + streak, and does a location-locked QR check-in at `/c/<gym-slug>`. |

## Stack

- **Next.js 16** (App Router, React 19, Tailwind v4) on **Vercel**
- **Drizzle ORM + `pg`** against **Neon Postgres** — pooled URL for the app,
  unpooled for migrations
- Auth built from scratch: scrypt password hashing, DB-backed sessions
  (httpOnly cookie, 30 days), `must_change_password` first-login flow,
  `require-<role>` guards, a forgot-password email flow. **No 2FA.**
- **WhatsApp reminders** are split: the app *plans* them (writes
  `reminder_jobs`); a local script *sends* them via a laptop-hosted
  [WAHA](https://waha.devlike.pro/) — see [`engine/`](./engine/README.md).

## Local setup

```bash
nvm use                      # Node 24 (.nvmrc)
npm install
vercel env pull .env.local   # DATABASE_URL(_UNPOOLED), SESSION_SECRET, …
npm run db:migrate           # apply migrations to the branch in .env.local
npm run db:seed-admin        # initial admin login
npm run db:seed-dev          # optional: one fully-populated "Demo Gym"
npm run dev
```

`db:seed-dev` prints demo logins (owner + member) and refuses to run with
`NODE_ENV=production`.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | eslint |
| `npm test` | vitest (unit + integration; `db/**` suites hit the Neon branch in `DATABASE_URL` and self-skip when it's unset) |
| `npm run db:generate` | drizzle-kit — generate a migration from schema changes |
| `npm run db:migrate` | apply pending migrations (unpooled URL) |
| `npm run db:seed-admin` | create / confirm the initial admin |
| `npm run db:seed-dev` | rebuild the demo gym |

## Layout

```
app/                    routes — (protected)/{admin,owner,employee,m}, /c, /activate, /api
db/schema/              Drizzle tables, one file per area
db/queries/             all DB access, one file per area, server-only
db/migrations/          generated SQL — never hand-edited
src/features/auth/      password, session, guards, scopes, rate-limit
src/features/checkin/   rotating QR token
lib/                    pure helpers (money, phone, billing, streak, template, …)
engine/                 the local WhatsApp sender (not deployed)
```

## Build discipline

- Work phase → batch → task; each batch is a PR, green on
  typecheck + lint + test + build + a Vercel preview.
- Migrations are generated last, just before the PR, and applied to the DB
  **before** the merge.
- Preview deployments use a dedicated Neon `preview` branch — they never touch
  production data.

See [`HANDOFF.md`](./HANDOFF.md) for the operational details (env vars, crons,
production migration steps, the reminder engine).
