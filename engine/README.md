# Engine (local)

The Vercel app **plans** work — it writes `reminder_jobs` and marks promotions
`sending` in Neon. It never sends anything, because WAHA runs on the laptop and
isn't internet-reachable. This folder is the **sender**: local scripts that
read Neon and send via the local WAHA.

- `send-reminders.mjs` — payment reminders (Phase 6).
- `send-promotions.mjs` — paid bulk promotions (CR-10 F.6).

Nothing here is deployed. It lives in the repo so it stays versioned with the
schema it depends on.

## One-time setup

1. `cp engine/.env.example engine/.env` and fill in `DATABASE_URL` (the Neon
   **pooled** string) and `WAHA_API_KEY`. `engine/.env` is gitignored.
2. Make sure each gym has a `waha_session` set in **Owner → Settings** and that
   session is linked in the WAHA dashboard.

## Run

```powershell
# start Docker (n8n + WAHA), wait for WAHA, send once:
powershell -ExecutionPolicy Bypass -File engine\start-engine.ps1

# keep sending every 15 minutes:
powershell -ExecutionPolicy Bypass -File engine\start-engine.ps1 -Loop -EveryMinutes 15
```

Or just the senders, if WAHA is already up:

```
node engine/send-reminders.mjs
node engine/send-promotions.mjs
```

`start-engine.ps1` runs both, once per cycle.

## What it does

`SELECT`s `reminder_jobs` where `status = 'pending'` and `scheduled_for <=
CURRENT_DATE`, joins `members` for the phone, and for each one:

- `POST {WAHA_URL}/api/sendText` with `{ session, chatId, text }`
- on success → `status = 'sent'`, `sent_at`, `waha_message_id`
- on failure → `attempts++`; stays `pending` for the next run until
  `MAX_ATTEMPTS`, then `status = 'failed'` with the error
- `SEND_DELAY_MS` pause between messages

Catch-up is automatic: a job whose `scheduled_for` passed while the laptop was
off is still `pending` and gets sent on the next run. Every successful reminder
send is also tallied per gym per day in `waha_send_log` (`kind = 'reminder'`),
which the promotions runner subtracts from the daily cap.

## Promotions (`send-promotions.mjs`)

For each promotion in status `sending` (and not `paused_at`):

- **Budget**: `waha_daily_cap − transactional_reserve − today's reminder /
  activation sends − promo sends already made today`. Zero → the promotion
  stays `sending` and resumes on the next run.
- **09:00–20:00 gym-local only**; a randomised 5–12 s gap between sends.
- **Existence precheck** for `contact`-source numbers via WAHA
  `contacts/check-exists` → `wa_exists`. Not registered → both parts `skipped`,
  never charged.
- **Text part** → `/api/sendText`. **Image part** → the runner downloads the
  bytes from `${APP_URL}/api/promo-media/[id]` (Bearer `PROMO_MEDIA_SECRET`),
  base64-encodes locally, and calls `/api/sendImage` — WAHA never sees a URL.
  A 503 from that endpoint → image part `skipped`, text still sends.
- Per-part `status` / `waha_id` / `error`; `attempts` retried to `MAX_ATTEMPTS`.
- A failure-rate spike in one run → `paused_at` / `pause_reason` set for the
  admin to review.
- When every recipient part is terminal: `billed_total_paise` = delivered
  parts × `per_message_paise`, `refund_paise` = `prepaid − billed`,
  `settlement` = `settled` | `refund_due`, promotion → `sent` / `partly_failed`
  / `failed`.

## Moving to always-on hosting later

Point the same script (or a port of it) at a hosted WAHA from a small VPS. The
dashboard doesn't change — it only ever reads `reminder_jobs`.
