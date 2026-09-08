# Reminder engine (local)

The Vercel app **plans** reminders — it writes `reminder_jobs` rows into Neon.
It never sends anything, because WAHA runs on the laptop and isn't
internet-reachable. This folder is the **sender**: a local script that reads
`reminder_jobs` from Neon and sends the due ones via the local WAHA.

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

Or just the sender, if WAHA is already up:

```
node engine/send-reminders.mjs
```

## What it does

`SELECT`s `reminder_jobs` where `status = 'pending'` and `scheduled_for <=
CURRENT_DATE`, joins `members` for the phone, and for each one:

- `POST {WAHA_URL}/api/sendText` with `{ session, chatId, text }`
- on success → `status = 'sent'`, `sent_at`, `waha_message_id`
- on failure → `attempts++`; stays `pending` for the next run until
  `MAX_ATTEMPTS`, then `status = 'failed'` with the error
- `SEND_DELAY_MS` pause between messages

Catch-up is automatic: a job whose `scheduled_for` passed while the laptop was
off is still `pending` and gets sent on the next run.

## Moving to always-on hosting later

Point the same script (or a port of it) at a hosted WAHA from a small VPS. The
dashboard doesn't change — it only ever reads `reminder_jobs`.
