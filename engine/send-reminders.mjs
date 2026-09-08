/**
 * Local reminder sender (Phase 6 Batch 6.2). Runs on the laptop, next to WAHA.
 *
 *   node engine/send-reminders.mjs
 *
 * Reads Neon for `reminder_jobs` that are `pending` and due (`scheduled_for <=
 * today`), sends each via the local WAHA, and writes the result back. The
 * Vercel dashboard only ever reads `reminder_jobs`, so this script can later
 * move to always-on hosting with no dashboard change.
 *
 * Env (from the shell, or `engine/.env`, or `../.env`):
 *   DATABASE_URL      Neon pooled connection string
 *   WAHA_URL          default http://localhost:3000
 *   WAHA_API_KEY      WAHA X-Api-Key
 *   SEND_DELAY_MS     pause between sends, default 4000 (reduce flagging risk)
 *   MAX_ATTEMPTS      tries before a job is marked failed, default 3
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { nextStatus, sendViaWaha, toChatId } from "./sender.mjs";

const here = dirname(fileURLToPath(import.meta.url));
for (const file of [join(here, ".env"), join(here, "..", "..", ".env")]) {
  if (!process.env.DATABASE_URL && existsSync(file)) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* ignore */
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const WAHA_URL = process.env.WAHA_URL || "http://localhost:3000";
const WAHA_API_KEY = process.env.WAHA_API_KEY || "";
const SEND_DELAY_MS = Number(process.env.SEND_DELAY_MS || 4000);
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 3);

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. See engine/.env.example.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `select rj.id, rj.waha_session, rj.message_text, rj.attempts, m.phone
         from reminder_jobs rj
         join members m on m.id = rj.member_id
        where rj.status = 'pending'
          and rj.scheduled_for <= current_date
        order by rj.scheduled_for asc, rj.created_at asc`,
    );

    if (rows.length === 0) {
      console.log("No reminders due.");
      return;
    }
    console.log(`${rows.length} reminder(s) to send.`);

    let sent = 0;
    let failed = 0;
    for (const [i, job] of rows.entries()) {
      const result = await sendViaWaha({
        wahaUrl: WAHA_URL,
        apiKey: WAHA_API_KEY,
        session: job.waha_session,
        chatId: toChatId(job.phone),
        text: job.message_text,
      });
      const next = nextStatus({
        attempts: job.attempts,
        ok: result.ok,
        maxAttempts: MAX_ATTEMPTS,
      });

      await pool.query(
        `update reminder_jobs
            set status = $2,
                attempts = $3,
                sent_at = case when $2 = 'sent' then now() else sent_at end,
                waha_message_id = coalesce($4, waha_message_id),
                error = $5,
                updated_at = now()
          where id = $1`,
        [
          job.id,
          next.status,
          next.attempts,
          result.ok ? result.messageId : null,
          result.ok ? null : result.error,
        ],
      );

      if (next.status === "sent") sent++;
      else if (next.status === "failed") failed++;
      console.log(
        `  ${job.id} → ${next.status}${result.ok ? "" : ` (${result.error})`}`,
      );

      if (i < rows.length - 1) await sleep(SEND_DELAY_MS);
    }
    console.log(`Done. sent=${sent} failed=${failed} retrying=${rows.length - sent - failed}`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
