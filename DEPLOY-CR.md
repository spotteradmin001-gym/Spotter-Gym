# Production cutover runbook — change requests CR-1 … CR-10

Phases A–F of `E:\whatsapp-gym-stack\SPOTTER_CR_PLAN.md` are built and merged
to `main` (PRs #27–#52). The Vercel **Production** deployment rebuilds on
every `main` merge and is already Ready — the new pages just can't serve their
DB-backed parts until the Neon `main` branch gets migrations `0013`–`0017`,
and the two credential/promotions features stay in graceful-degraded mode
until their env vars are set.

Everything below writes to the production database or the production Vercel
config, so it is owner-run (the assistant's harness blocks production writes).
Run it from `E:\whatsapp-gym-stack\Spotter-Gym`. This is additive on top of the
original `DEPLOY.md` — if the first go-live (admin seed, `CRON_SECRET`,
`MAIL_*`) was already done, you only need the steps here.

## What shipped

| CR | Feature | New migration | New env var |
|---|---|---|---|
| CR-1 | WAHA session name is admin-owned (hidden from owner) | — | — |
| CR-2 | "Use my current location" button in gym settings | — | — |
| CR-4 | Activity log restricted to platform admin | — | — |
| CR-5 | Owner "Staff activity" view + employee action auditing | — | — |
| CR-6 | Retrievable + resettable staff credentials | `0013` | `CREDENTIAL_ENC_KEY` |
| CR-7 | "Share via WhatsApp" for credentials / activation links | — | — |
| CR-8 | WhatsApp contact icon on people lists | — | — |
| CR-3 | Responsive owner / admin / employee portals | — | — |
| CR-9 | Member streak calendar, check-in celebration, attendance-reward engine + treasure chest | `0014`, `0015` | — |
| CR-10 | Paid bulk WhatsApp promotions with anti-ban guardrails | `0016`, `0017` | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GDRIVE_PROMO_FOLDER_ID`, `PROMO_MEDIA_SECRET` |

New cron: `/api/cron/evaluate-streak-rewards` (daily 03:00 UTC) — already in
`vercel.json`, arms on the next `vercel --prod`.

343 unit tests + Playwright e2e. Migrations `0013`–`0017` are all additive
(new tables + new nullable/defaulted columns + one CHECK-constraint
relaxation) and have been applied to the Neon **preview** branch and exercised
in CI.

---

## 0. Prereqs

- `neonctl` authed, project `misty-recipe-68750268`.
- `vercel` CLI linked to `spotter15/spotter-gym`.
- A Google account to make a service account + Drive folder (step 3).

## 1. Snapshot the Neon `main` branch

```powershell
neonctl branches create --project-id misty-recipe-68750268 --name "backup-$(Get-Date -Format yyyyMMdd-HHmm)" --parent main
```

Note the branch id. Roll back if a migration goes wrong:

```powershell
neonctl branches restore main <backup-branch-id> --project-id misty-recipe-68750268
```

## 2. Apply migrations `0013`–`0017` to `main`

```powershell
$env:DATABASE_URL = ""
$env:DATABASE_URL_UNPOOLED = (neonctl connection-string main --project-id misty-recipe-68750268 --pooled false)
npm run db:migrate
Remove-Item Env:DATABASE_URL_UNPOOLED
```

Expect `Migrations applied. Database is up to date.` This creates
`temp_credentials`, `gym_holidays`, `streak_rewards`, `promotions`,
`promotion_recipients`, `waha_send_log`; adds `gyms.closed_weekdays`,
`gyms.streak_reward_percent`, `gyms.streak_allowed_misses`,
`gyms.waha_daily_cap`, `gyms.transactional_reserve`; and relaxes two CHECK
constraints on the employee-permission tables.

## 3. Google service account + Drive folder (for promo images)

1. Google Cloud Console → a project (any) → **APIs & Services → Enable APIs** → enable **Google Drive API**.
2. **IAM & Admin → Service Accounts → Create service account** (e.g. `spotter-promo-media`). No roles needed. **Create key → JSON**, download it.
3. In Google Drive, create a folder (e.g. `Spotter promo images`). Open it, **Share** it with the service account's email (`…@….iam.gserviceaccount.com`) as **Editor**. Copy the folder id from the URL (`drive.google.com/drive/folders/<THIS>`).
4. The JSON key must be passed as a **single line**. To flatten it:

```powershell
$sa = Get-Content .\path\to\key.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress
```

## 4. Production env vars on Vercel

```powershell
# CR-6 credential vault key:
(openssl rand -base64 32) | vercel env add CREDENTIAL_ENC_KEY production

# CR-10 promotions media:
$sa                                  | vercel env add GOOGLE_SERVICE_ACCOUNT_JSON production
"<drive-folder-id>"                   | vercel env add GDRIVE_PROMO_FOLDER_ID production
(openssl rand -hex 32)               | vercel env add PROMO_MEDIA_SECRET production
```

Note the `PROMO_MEDIA_SECRET` value — the laptop engine needs the same string
in step 6.

Optional but recommended — add the same four to the **Preview** and
**Development** targets too (and `vercel env pull .env.local`) so the preview
deployment exercises the full feature:

```powershell
foreach ($t in "preview","development") {
  (openssl rand -base64 32) | vercel env add CREDENTIAL_ENC_KEY $t
  $sa                       | vercel env add GOOGLE_SERVICE_ACCOUNT_JSON $t
  "<drive-folder-id>"       | vercel env add GDRIVE_PROMO_FOLDER_ID $t
  (openssl rand -hex 32)    | vercel env add PROMO_MEDIA_SECRET $t
}
```

## 5. Redeploy production

```powershell
vercel --prod
```

Arms the four crons in `vercel.json` (dues 01:00, reminders 01:30,
streak-rewards 03:00, expenses monthly 02:00 UTC).

## 6. Laptop engine

```powershell
cd E:\whatsapp-gym-stack\Spotter-Gym
git pull
```

Edit `engine\.env` — add (the file already has `DATABASE_URL`, `WAHA_*`):

```
APP_URL=https://spotter-gym-pi.vercel.app
PROMO_MEDIA_SECRET=<same value set in step 4>
```

Then:

```powershell
powershell -ExecutionPolicy Bypass -File engine\start-engine.ps1 -Loop -EveryMinutes 15
```

`start-engine.ps1` now runs **both** `send-reminders.mjs` and
`send-promotions.mjs` each cycle. The promotions runner does nothing until a
promotion reaches status `sending`.

## 7. Smoke test (production URL)

- **CR-1** — Admin → create a gym: the WAHA session name field is on the admin
  form now; open the gym → the "WhatsApp session" control is admin-only. Sign
  in as that gym's owner → `/owner/settings` shows it read-only.
- **CR-2** — `/owner/settings` → "Use my current location" fills lat/lng (grant
  the browser permission; use a phone on-site for real accuracy).
- **CR-4 / CR-5** — no "Activity" link in the owner nav; "Staff activity" link
  is present and lists employee actions once an employee does something.
- **CR-6** — Admin gym detail → an owner row → "Show temp password" reveals the
  one-time password (works now that `CREDENTIAL_ENC_KEY` is set); "Reset
  password" issues a new one + a "Share via WhatsApp" button with the reset
  link.
- **CR-3** — open `/owner` and `/admin/gyms` on a phone: nav collapses to a
  hamburger, tables become stacked cards, no sideways scroll.
- **CR-9** — sign in as a member, check in at the gym QR: celebration +
  streak; `/m` shows the streak calendar. In `/owner/settings` set a non-zero
  "Streak reward %" to switch the reward on for that gym.
- **CR-10** — `/owner/promotions` → compose (text + optional image) → pick a
  couple of member recipients + one known contact → confirm the warning →
  submit. As admin, `/admin/promotions` → price per message → the owner marks
  it prepaid → admin marks `paid` → admin "Send". Watch the laptop engine send
  it via the gym's WAHA session; check the per-recipient status on the detail
  page and the final bill vs prepaid.

## Rollback

- App: `vercel rollback`, or redeploy an earlier `main` commit.
- DB: `neonctl branches restore main <backup-branch-id> --project-id misty-recipe-68750268`.
