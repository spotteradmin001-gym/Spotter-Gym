/**
 * Local promotions sender (Phase F / CR-10 F.6). Runs on the laptop, next to
 * WAHA and the reminder sender.
 *
 *   node engine/send-promotions.mjs
 *
 * For every promotion in status `sending` it works through
 * `promotion_recipients`, honouring the per-gym daily cap + transactional
 * reserve, a randomised 5–12 s gap, the 09:00–20:00 gym-local window, and the
 * failure-rate auto-pause. It stops for the day when the budget hits zero
 * (the promotion stays `sending` and resumes next run); when every recipient
 * is resolved it computes the final bill / refund and closes the promotion.
 *
 * Env (shell, or engine/.env, or ../../.env):
 *   DATABASE_URL        Neon pooled connection string
 *   WAHA_URL            default http://localhost:3000
 *   WAHA_API_KEY        WAHA X-Api-Key
 *   APP_URL             the deployed app, for GET /api/promo-media/[id]
 *   PROMO_MEDIA_SECRET  Bearer secret for that endpoint
 *   MAX_ATTEMPTS        part-send tries before it is marked failed, default 3
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  nextPartStatus,
  promoBudgetRemaining,
  promotionFinalState,
  randomGapMs,
  recipientPartPlan,
  recipientResolved,
  shouldAutoPause,
  withinSendWindow,
} from "./promotions.mjs";
import {
  deletePromoMedia,
  fetchPromoMedia,
  sendImageViaWaha,
  sendViaWaha,
  toChatId,
  wahaCheckContactExists,
} from "./sender.mjs";

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
const APP_URL = process.env.APP_URL || "";
const PROMO_MEDIA_SECRET = process.env.PROMO_MEDIA_SECRET || "";
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 3);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CACHE_DIR = join(here, ".cache");

function extForMime(mimetype) {
  if (mimetype === "image/png") return "png";
  if (mimetype === "image/webp") return "webp";
  return "jpg";
}

/**
 * Download a promotion's image once and stash it under engine/.cache. Every
 * recipient's image part is then base64'd from the local file — one GET per
 * promotion per run, not one per recipient. Returns:
 *   { disabled: true }            media endpoint 404/503 → send text-only
 *   { ok: false, error }          transient fetch failure → retry the part
 *   { ok: true, file, mimetype }  ready to send
 */
async function cachePromoImage(promotionId) {
  const media = await fetchPromoMedia({
    appUrl: APP_URL,
    secret: PROMO_MEDIA_SECRET,
    promotionId,
  });
  if (media.disabled) return { disabled: true };
  if (!media.ok) return { ok: false, error: media.error };

  mkdirSync(CACHE_DIR, { recursive: true });
  const file = join(CACHE_DIR, `promo-${promotionId}.${extForMime(media.mimetype)}`);
  writeFileSync(file, Buffer.from(media.base64, "base64"));
  return { ok: true, file, mimetype: media.mimetype };
}

function discardPromoImageCache(cached) {
  if (cached && cached.ok && cached.file) {
    try {
      rmSync(cached.file, { force: true });
    } catch {
      /* ignore */
    }
  }
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. See engine/.env.example.");
  process.exit(1);
}

async function transactionalCountToday(pool, gymId) {
  const { rows } = await pool.query(
    `select coalesce(sum(count), 0)::int as n
       from waha_send_log
      where gym_id = $1
        and sent_on = current_date
        and kind in ('reminder', 'activation')`,
    [gymId],
  );
  return rows[0]?.n ?? 0;
}

async function promoCountToday(pool, gymId) {
  const { rows } = await pool.query(
    `select coalesce(count, 0)::int as n
       from waha_send_log
      where gym_id = $1 and sent_on = current_date and kind = 'promo'`,
    [gymId],
  );
  return rows[0]?.n ?? 0;
}

async function bumpPromoLog(pool, gymId, by) {
  if (by <= 0) return;
  await pool.query(
    `insert into waha_send_log (gym_id, sent_on, kind, count)
       values ($1, current_date, 'promo', $2)
     on conflict (gym_id, sent_on, kind)
       do update set count = waha_send_log.count + excluded.count,
                     updated_at = now()`,
    [gymId, by],
  );
}

async function setPart(pool, recipientId, part, status, wahaId, error, attempts) {
  const col = part === "text" ? "text" : "image";
  await pool.query(
    `update promotion_recipients
        set ${col}_status = $2,
            ${col}_waha_id = coalesce($3, ${col}_waha_id),
            ${col}_error = $4,
            attempts = $5,
            updated_at = now()
      where id = $1`,
    [recipientId, status, wahaId, error, attempts],
  );
}

async function processPromotion(pool, promo) {
  const gymRes = await pool.query(
    `select id, timezone, waha_session_name, waha_daily_cap, transactional_reserve
       from gyms where id = $1`,
    [promo.gym_id],
  );
  const gym = gymRes.rows[0];
  if (!gym) {
    console.log(`  promo ${promo.id}: gym missing, skipping`);
    return;
  }

  if (!withinSendWindow(new Date(), gym.timezone)) {
    console.log(`  promo ${promo.id}: outside 09:00–20:00 ${gym.timezone}`);
    return;
  }

  const [transactionalToday, promoSentToday] = await Promise.all([
    transactionalCountToday(pool, gym.id),
    promoCountToday(pool, gym.id),
  ]);
  let budget = promoBudgetRemaining({
    dailyCap: gym.waha_daily_cap,
    reserve: gym.transactional_reserve,
    transactionalToday,
    promoSentToday,
  });
  if (budget <= 0) {
    console.log(`  promo ${promo.id}: daily budget exhausted, resumes tomorrow`);
    return;
  }

  const { rows: recipients } = await pool.query(
    `select id, phone, source, wa_exists, text_status, image_status, attempts
       from promotion_recipients
      where promotion_id = $1
        and (text_status = 'pending' or image_status = 'pending')
      order by created_at asc`,
    [promo.id],
  );

  const session = gym.waha_session_name || "";
  let attempted = 0;
  let failed = 0;
  let promoSends = 0;

  // One media download per promotion per run — cached locally, base64'd from
  // the file for each recipient below.
  let promoImage = null;
  if (promo.has_image) {
    promoImage = await cachePromoImage(promo.id);
    if (promoImage.disabled) {
      console.log(`  promo ${promo.id}: image unavailable → sending text-only`);
    } else if (!promoImage.ok) {
      console.log(`  promo ${promo.id}: image fetch failed (${promoImage.error}); retry next run`);
    }
  }

  for (const rec of recipients) {
    if (budget <= 0) break;

    // WhatsApp-existence precheck for contact-source numbers.
    let waExists = rec.source === "member" ? true : rec.wa_exists;
    if (rec.source === "contact" && waExists == null) {
      const check = await wahaCheckContactExists({
        wahaUrl: WAHA_URL,
        apiKey: WAHA_API_KEY,
        session,
        phone: rec.phone,
      });
      if (check.ok) {
        waExists = check.exists;
        await pool.query(
          `update promotion_recipients set wa_exists = $2, updated_at = now() where id = $1`,
          [rec.id, waExists],
        );
      } else {
        console.log(`  ${rec.phone}: precheck failed (${check.error}); retry next run`);
        continue;
      }
    }

    const plan = recipientPartPlan({
      waExists,
      hasText: promo.has_text,
      hasImage: promo.has_image,
    });
    const to = toChatId(rec.phone);
    let attempts = rec.attempts;

    // Not on WhatsApp → both parts skipped, uncharged.
    if (plan.text === "skip" || plan.image === "skip") {
      if (rec.text_status === "pending")
        await setPart(pool, rec.id, "text", "skipped", null, "not on WhatsApp", attempts);
      if (rec.image_status === "pending")
        await setPart(pool, rec.id, "image", "skipped", null, "not on WhatsApp", attempts);
      console.log(`  ${rec.phone}: not on WhatsApp → skipped`);
      continue;
    }

    // Text part.
    if (plan.text === "send" && rec.text_status === "pending" && budget > 0) {
      const r = await sendViaWaha({
        wahaUrl: WAHA_URL,
        apiKey: WAHA_API_KEY,
        session,
        chatId: to,
        text: promo.body ?? "",
      });
      const nx = nextPartStatus({ attempts, ok: r.ok, maxAttempts: MAX_ATTEMPTS });
      attempts = nx.attempts;
      await setPart(
        pool,
        rec.id,
        "text",
        nx.status,
        r.ok ? r.messageId : null,
        r.ok ? null : r.error,
        attempts,
      );
      attempted += 1;
      if (!r.ok) failed += 1;
      budget -= 1;
      promoSends += 1;
      console.log(`  ${rec.phone} text → ${nx.status}${r.ok ? "" : ` (${r.error})`}`);
      await sleep(randomGapMs());
    }

    // Image part — base64 from the local cache file, send (WAHA never sees a URL).
    if (plan.image === "send" && rec.image_status === "pending" && budget > 0) {
      if (!promoImage || promoImage.disabled) {
        await setPart(
          pool,
          rec.id,
          "image",
          "skipped",
          null,
          "image not available at send time",
          attempts,
        );
        console.log(`  ${rec.phone} image → skipped (media unavailable)`);
      } else if (!promoImage.ok) {
        const nx = nextPartStatus({ attempts, ok: false, maxAttempts: MAX_ATTEMPTS });
        attempts = nx.attempts;
        await setPart(pool, rec.id, "image", nx.status, null, promoImage.error, attempts);
        attempted += 1;
        failed += 1;
        console.log(`  ${rec.phone} image → ${nx.status} (${promoImage.error})`);
      } else {
        const r = await sendImageViaWaha({
          wahaUrl: WAHA_URL,
          apiKey: WAHA_API_KEY,
          session,
          chatId: to,
          base64: readFileSync(promoImage.file).toString("base64"),
          mimetype: promoImage.mimetype,
          filename: `promo-${promo.id}`,
        });
        const nx = nextPartStatus({ attempts, ok: r.ok, maxAttempts: MAX_ATTEMPTS });
        attempts = nx.attempts;
        await setPart(
          pool,
          rec.id,
          "image",
          nx.status,
          r.ok ? r.messageId : null,
          r.ok ? null : r.error,
          attempts,
        );
        attempted += 1;
        if (!r.ok) failed += 1;
        budget -= 1;
        promoSends += 1;
        console.log(`  ${rec.phone} image → ${nx.status}${r.ok ? "" : ` (${r.error})`}`);
        await sleep(randomGapMs());
      }
    }

    if (shouldAutoPause({ attempted, failed })) {
      await pool.query(
        `update promotions
            set paused_at = now(),
                pause_reason = $2,
                updated_at = now()
          where id = $1 and paused_at is null`,
        [
          promo.id,
          "High failure rate during send — check the gym's WhatsApp session.",
        ],
      );
      console.log(`  promo ${promo.id}: auto-paused (failure rate)`);
      await bumpPromoLog(pool, gym.id, promoSends);
      return;
    }
  }

  await bumpPromoLog(pool, gym.id, promoSends);

  // Resolution check — every recipient part in a terminal state?
  const { rows: allRecipients } = await pool.query(
    `select text_status, image_status from promotion_recipients where promotion_id = $1`,
    [promo.id],
  );
  const done =
    allRecipients.length > 0 &&
    allRecipients.every((r) =>
      recipientResolved({ textStatus: r.text_status, imageStatus: r.image_status }),
    );

  if (done) {
    const final = promotionFinalState(
      allRecipients.map((r) => ({
        textStatus: r.text_status,
        imageStatus: r.image_status,
      })),
      { perMessagePaise: promo.per_message_paise, prepaidPaise: promo.prepaid_paise },
    );
    await pool.query(
      `update promotions
          set status = $2,
              billed_total_paise = $3,
              refund_paise = $4,
              settlement = $5,
              sent_at = coalesce(sent_at, now()),
              reconciled_at = now(),
              updated_at = now()
        where id = $1 and status = 'sending'`,
      [
        promo.id,
        final.status,
        final.billedTotalPaise,
        final.refundPaise,
        final.settlement,
      ],
    );
    console.log(
      `  promo ${promo.id} → ${final.status}; billed ${final.billedTotalPaise} refund ${final.refundPaise} (${final.settlement})`,
    );

    // Terminal this run → the image has done its job. Delete it from the app
    // and drop the local cache file; the daily purge is the backstop.
    if (promo.has_image) {
      const del = await deletePromoMedia({
        appUrl: APP_URL,
        secret: PROMO_MEDIA_SECRET,
        promotionId: promo.id,
      });
      if (!del.ok) {
        console.log(
          `  promo ${promo.id}: image delete failed (${del.error}); daily purge will catch it`,
        );
      }
      discardPromoImageCache(promoImage);
    }
  } else {
    console.log(`  promo ${promo.id}: ${promoSends} sent this run, more to go`);
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const { rows: promos } = await pool.query(
      `select id, gym_id, body, has_text, has_image, per_message_paise, prepaid_paise
         from promotions
        where status = 'sending' and paused_at is null
        order by created_at asc`,
    );
    if (promos.length === 0) {
      console.log("No promotions sending.");
      return;
    }
    console.log(`${promos.length} promotion(s) sending.`);
    for (const promo of promos) {
      await processPromotion(pool, promo);
    }
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
