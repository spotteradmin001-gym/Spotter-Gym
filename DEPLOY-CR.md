# Production cutover runbook — change requests CR-1 … CR-10

Phases A–F of `E:\whatsapp-gym-stack\SPOTTER_CR_PLAN.md` plus post-review
revisions R.1–R.4 are built and merged to `main` (PRs #27–#56). The Vercel
**Production** deployment rebuilds on every `main` merge and is already Ready
— the new pages just can't serve their DB-backed parts until the Neon `main`
branch gets migrations `0013`–`0018`, and the credential + promotions
features stay in graceful-degraded mode until their env vars are set.

**Promo images are stored in Neon** (a `bytea` column), downloaded once by the
laptop engine and deleted the moment a promotion finishes sending — so there
is **no Google / Vercel Blob / object store to set up**. The only promotions
env var is `PROMO_MEDIA_SECRET`.

Everything below writes to the production database or the production Vercel
config, so it is owner-run (the assistant's harness blocks production writes).
Run it from `E:\whatsapp-gym-stack\Spotter-Gym`. This is additive on top of the
original `DEPLOY.md` — if the first go-live (admin seed, `CRON_SECRET`,
`MAIL_*`, migrations `0000`–`0012`) was already done, you only need the steps
here.

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
| CR-10 | Paid bulk WhatsApp promotions with anti-ban guardrails; promo images in Neon `bytea`, deleted after send | `0016`, `0017`, `0018` | `PROMO_MEDIA_SECRET` |

Post-review revisions folded in (PRs #53–#56): streak reward auto-slides to
the next unpaid due; the schedule per-cycle lock is gone (edits recompute for
everyone immediately); admin quote/bill send shows an owner picker for
multi-owner gyms; promo images moved off Google Drive into a Neon `bytea`
column that the laptop engine downloads once and then deletes.

New cron: `/api/cron/evaluate-streak-rewards` (daily 03:00 UTC) — already in
`vercel.json`, arms on the next `vercel --prod`. The existing `plan-reminders`
cron now also purges promo-image bytes left on promotions that finished more
than 7 days ago (safety net; the engine deletes them on send).

~353 unit tests + Playwright e2e. Migrations `0013`–`0018` are all additive
(new tables + new nullable/defaulted columns + one CHECK-constraint
relaxation) and have been applied to the Neon **preview** branch and exercised
in CI.

---

## 0. Prereqs

- `neonctl` authed, project `misty-recipe-68750268`.
- `vercel` CLI linked to `spotter15/spotter-gym`.
- No Google / object-store account needed.

## 1. Snapshot the Neon `main` branch

```powershell
neonctl branches create --project-id misty-recipe-68750268 --name "backup-$(Get-Date -Format yyyyMMdd-HHmm)" --parent main
```

Note the branch id. Roll back if a migration goes wrong:

```powershell
neonctl branches restore main <backup-branch-id> --project-id misty-recipe-68750268
```

## 2. Apply migrations `0013`–`0018` to `main`

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
`gyms.waha_daily_cap`, `gyms.transactional_reserve`,
`promotions.image_bytes` / `image_stored_at` / `image_deleted_at`; and relaxes
two CHECK constraints on the employee-permission tables.

## 3. Production env vars on Vercel

```powershell
# CR-6 credential vault key:
(openssl rand -base64 32) | vercel env add CREDENTIAL_ENC_KEY production

# CR-10 promo-media proxy secret (the laptop engine needs the SAME value in step 5):
(openssl rand -hex 32)   | vercel env add PROMO_MEDIA_SECRET production
```

Optional but recommended — add the same two to the **Preview** and
**Development** targets too, then `vercel env pull .env.local`, so the preview
deployment exercises the full feature:

```powershell
foreach ($t in "preview","development") {
  (openssl rand -base64 32) | vercel env add CREDENTIAL_ENC_KEY $t
  (openssl rand -hex 32)    | vercel env add PROMO_MEDIA_SECRET $t
}
```

## 4. Redeploy production

```powershell
vercel --prod
```

Arms the four crons in `vercel.json` (dues 01:00, reminders 01:30,
streak-rewards 03:00, expenses monthly 02:00 UTC).

## 5. Laptop engine

```powershell
cd E:\whatsapp-gym-stack\Spotter-Gym
git pull
```

Edit `engine\.env` — add (the file already has `DATABASE_URL`, `WAHA_*`):

```
APP_URL=https://spotter-gym-pi.vercel.app
PROMO_MEDIA_SECRET=<same value set in step 3>
```

Then:

```powershell
powershell -ExecutionPolicy Bypass -File engine\start-engine.ps1 -Loop -EveryMinutes 15
```

`start-engine.ps1` now runs **both** `send-reminders.mjs` and
`send-promotions.mjs` each cycle. The promotions runner does nothing until a
promotion reaches status `sending`. It downloads a promotion's image once,
caches it under `engine\.cache\`, and deletes both the local copy and the
Neon `image_bytes` row when the promotion finishes.

## 6. Smoke test (production URL)

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
  page and the final bill vs prepaid. The promotion's `image_bytes` should be
  null again once it reaches `sent`.

## 7. Base-app go-live smoke (was paused before this CR work)

If never done: create the first gym, create an owner login, sign in as that
owner, set the gym's geo fence (CR-2 button) + WAHA session name (as admin),
and link that gym's WhatsApp number in the WAHA dashboard
(`http://localhost:3000/dashboard`) under the session name.

## Rollback

- App: `vercel rollback`, or redeploy an earlier `main` commit.
- DB: `neonctl branches restore main <backup-branch-id> --project-id misty-recipe-68750268`.
