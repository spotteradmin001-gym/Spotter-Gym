# Production go-live runbook

Phases 0–7 are built and merged (`main`, PR #25). **The Vercel Production
deployment already exists and rebuilds on every merge to `main`** — it just
can't serve DB-backed pages yet because the Neon `main` branch has no schema.

Everything below writes to the production database or the production Vercel
config, so it must be run by the owner (the assistant's harness blocks
production writes). Run it from `E:\whatsapp-gym-stack\Spotter-Gym`.

## 0. Prereqs

- `neonctl` authed (it is on this machine), project `misty-recipe-68750268`.
- `vercel` CLI linked to `spotter15/spotter-gym` (it is).
- The Gmail **App Password** — the trailing `password …` line in
  `E:\whatsapp-gym-stack\.env`.

## 1. Snapshot `main` (already done once — redo if you retry later)

A pre-migration snapshot branch was created:
`backup-pre-migrate-*` (endpoint `ep-cold-truth-azvqwth6`). To make a fresh one:

```powershell
neonctl branches create --project-id misty-recipe-68750268 --name "backup-$(Get-Date -Format yyyyMMdd-HHmm)" --parent main
```

To roll `main` back to a snapshot if a migration goes wrong:

```powershell
neonctl branches restore main <backup-branch-id> --project-id misty-recipe-68750268
```

## 2. Migrate the `main` branch

```powershell
$env:DATABASE_URL = ""
$env:DATABASE_URL_UNPOOLED = (neonctl connection-string main --project-id misty-recipe-68750268 --pooled false)
npm run db:migrate
Remove-Item Env:DATABASE_URL_UNPOOLED
```

Expect: `Migrations applied. Database is up to date.` (creates all tables for
migrations `0000`–`0012`; all additive).

## 3. Seed the admin on `main`

```powershell
$env:SEED_ADMIN_EMAIL = "spotter.admin001@gmail.com"
$env:SEED_ADMIN_PASSWORD = "Startup#2026"          # change it in-app after first login
$env:DATABASE_URL = (neonctl connection-string main --project-id misty-recipe-68750268)
npm run db:seed-admin
Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD
```

Expect: `Created admin spotter.admin001@gmail.com (id …).`

## 4. Production env vars on Vercel

```powershell
# Cron auth — generate once:
$cron = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
$cron | vercel env add CRON_SECRET production

# Gmail SMTP (paste the app password from E:\whatsapp-gym-stack\.env):
"smtp.gmail.com"                            | vercel env add MAIL_HOST production
"465"                                       | vercel env add MAIL_PORT production
"spotter.admin001@gmail.com"                | vercel env add MAIL_USER production
"<GMAIL_APP_PASSWORD>"                      | vercel env add MAIL_PASSWORD production
"Spotter <spotter.admin001@gmail.com>"      | vercel env add MAIL_FROM production
```

Already present in Production (Neon integration + Phase 0): `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `SESSION_SECRET`.

## 5. Redeploy production

Env changes don't redeploy on their own:

```powershell
vercel --prod
```

This also arms the three crons in `vercel.json`
(`generate-dues` 01:00, `plan-reminders` 01:30, `materialize-expenses`
02:00 UTC).

## 6. Smoke-test

- Open the production URL → `/login` → sign in as
  `spotter.admin001@gmail.com` / `Startup#2026` → should land on `/admin/gyms`.
- Create a gym, create an owner login, sign in as the owner, set the gym's
  geo + WAHA session in Settings.

## 7. Reminder engine on the laptop

```powershell
cp engine\.env.example engine\.env
# fill DATABASE_URL with the *production pooled* string:
#   neonctl connection-string main --project-id misty-recipe-68750268
# fill WAHA_API_KEY from E:\whatsapp-gym-stack\.env
powershell -ExecutionPolicy Bypass -File engine\start-engine.ps1 -Loop -EveryMinutes 15
```

Link each gym's WhatsApp number in the WAHA dashboard
(`http://localhost:3000/dashboard`) under the session name set in the gym's
Settings.

## Rollback

- App: `vercel rollback` (or redeploy an earlier `main` commit).
- DB: `neonctl branches restore main <backup-branch-id> --project-id misty-recipe-68750268`.
