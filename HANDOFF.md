# Spotter — operations handoff

## Environments

| | Neon branch | Vercel target |
|---|---|---|
| Production | `main` (`br-purple-glade-…`) | Production |
| Preview / Dev | `preview` (`br-bold-haze-…`) | Preview + Development |

`vercel env pull .env.local` writes the **preview** strings. Preview
deployments and `npm test` (locally and in CI) only ever touch the `preview`
branch, so production data is safe from experiments.

## Environment variables

| Var | Where | Notes |
|---|---|---|
| `DATABASE_URL` | Vercel (all), `.env.local` | Neon **pooled** (pgbouncer) — the app |
| `DATABASE_URL_UNPOOLED` | Vercel (all), `.env.local` | Neon **direct** — migrations only |
| `SESSION_SECRET` | Vercel (all) | 32+ random bytes; also signs the check-in QR token |
| `CRON_SECRET` | Vercel (all) | Vercel Cron sends it as `Authorization: Bearer …`; without it the `/api/cron/*` routes 401 in production |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASSWORD` / `MAIL_FROM` | Vercel (all), `.env.local` | Gmail SMTP: `smtp.gmail.com` / `465` / the Spotter address / a Google **App Password** / `"Spotter <…>"`. **Unset ⇒ password-reset and member-invite emails are written to the server log instead of sent.** |
| `APP_URL` | Vercel (optional) | Absolute-link base; falls back to the Vercel production domain |

The reminder **engine** has its own `engine/.env` — see `engine/README.md`.
Never put `WAHA_*` on Vercel; WAHA isn't internet-reachable.

## Cron jobs (`vercel.json`)

| Path | Schedule (UTC) | Does |
|---|---|---|
| `/api/cron/generate-dues` | `0 1 * * *` | Ensure current + next month's `dues` for active members |
| `/api/cron/plan-reminders` | `30 1 * * *` | Ensure a `pre_due` + `on_due` `reminder_jobs` row per pending due |
| `/api/cron/materialize-expenses` | `0 2 1 * *` | Turn recurring expenses into `expenses` rows for the month |

Vercel enables crons from `vercel.json` on deploy. Set `CRON_SECRET` first.

## Migrations

1. `npm run db:generate` — from up-to-date `main`, after the schema change.
2. Review the SQL in `db/migrations/`.
3. Apply to the **target** branch **before** merging:
   - preview: `npm run db:migrate` (with `.env.local` pointed at preview)
   - **production**: point `DATABASE_URL_UNPOOLED` at `main` and run
     `npm run db:migrate` — a deliberate, separate step. Take a Neon branch
     snapshot / backup first.
4. Additive migrations (`CREATE TABLE`, `ADD COLUMN`, `ADD CONSTRAINT`) are
   safe to self-apply. A destructive one (drop/rename) needs a
   compatibility-preserving plan.

## Going to production for the first time

1. Apply migrations `0000`–latest to the `main` branch (step 3 above).
2. `SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed-admin` against
   `main` (or accept the committed defaults, then change the password in-app).
3. Add `CRON_SECRET` and the `MAIL_*` vars on Vercel; redeploy so crons arm.
4. On the laptop: `engine/.env` with the **production** pooled `DATABASE_URL`
   and the WAHA key; link each gym's WhatsApp session in the WAHA dashboard;
   run `engine/start-engine.ps1 -Loop`.

## The reminder loop

```
Vercel cron ──► reminder_jobs (Neon)  ◄── dashboard only reads this
                      │
        engine/send-reminders.mjs (laptop)
                      │
                local WAHA ──► WhatsApp
```

A job stays `pending` until the sender runs, so a day the laptop was off is
caught up on the next run. Moving the sender to always-on hosting later needs
**no dashboard change**.

## Known issues / notes

- Rate limiting (login, check-in) is in-process — best-effort per serverless
  instance. Fine for the pilot; a durable limiter (a table or KV) is the
  upgrade.
- Integration tests share the one `preview` branch. An interrupted local run
  can leave fixed-string fixture rows and make the next run fail on a unique
  constraint — re-run, or clear `test_*` rows.
- `git` identity for this repo is pinned repo-local to the Spotter account;
  never run `gh auth login/switch/logout`.
