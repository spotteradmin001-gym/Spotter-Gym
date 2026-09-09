/**
 * Pure helpers for the engine launcher (CR-12). No DB, no filesystem, no
 * process env — everything is passed in, so this is unit-tested in
 * launcher.test.mjs (picked up by the engine test glob in vitest.config.ts).
 *
 * The daemon (run-engine.mjs) and the HTA GUI both depend on these.
 */

export const DEFAULT_EVERY_MINUTES = 15;
export const MIN_EVERY_MINUTES = 1;
export const MAX_EVERY_MINUTES = 1440;

/** Force an interval into [1, 1440]; anything unparseable → the 15 min default. */
export function clampEveryMinutes(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_EVERY_MINUTES;
  if (n < MIN_EVERY_MINUTES) return MIN_EVERY_MINUTES;
  if (n > MAX_EVERY_MINUTES) return MAX_EVERY_MINUTES;
  return n;
}

/**
 * Parse `run-engine.mjs` argv (the slice after `node run-engine.mjs`).
 *   (none)                  → { mode: "loop", everyMinutes: 15 }
 *   --once                  → { mode: "once", everyMinutes: 15 }
 *   --loop --every 30       → { mode: "loop", everyMinutes: 30 }
 *   --loop --every bogus    → { mode: "loop", everyMinutes: 15 }
 */
export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  let mode = "loop";
  let everyMinutes = DEFAULT_EVERY_MINUTES;

  for (let i = 0; i < args.length; i += 1) {
    const a = String(args[i]);
    if (a === "--once") mode = "once";
    else if (a === "--loop") mode = "loop";
    else if (a === "--every") {
      everyMinutes = clampEveryMinutes(args[i + 1]);
      i += 1;
    } else if (a.startsWith("--every=")) {
      everyMinutes = clampEveryMinutes(a.slice("--every=".length));
    }
  }
  return { mode, everyMinutes };
}

/** `KEY=value` lines from an .env file body → a plain object. Ignores blanks / `#`. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const NUM = "(\\d+)";

/**
 * Reduce one cycle's raw stdout from the two senders into counts + a one-line
 * summary for `status.json` and the log header.
 *
 * `send-reminders.mjs` prints `  <id> → sent` / `→ failed (...)` per job and
 * ends with `Done. sent=N failed=M retrying=K`.
 * `send-promotions.mjs` prints `  <phone> text → sent` / `image → failed (...)`
 * per part, plus `promo <id> → sent; billed ...` on resolution.
 */
export function summariseCycle({ remindersOut = "", promotionsOut = "" } = {}) {
  const r = String(remindersOut);
  const p = String(promotionsOut);

  const doneLine = r.match(new RegExp(`Done\\. sent=${NUM} failed=${NUM} retrying=${NUM}`));
  const remindersSent = doneLine ? Number(doneLine[1]) : countMatches(r, /→ sent$/gm);
  const remindersFailed = doneLine ? Number(doneLine[2]) : countMatches(r, /→ failed\b/gm);
  const remindersNoneDue = /No reminders due\./.test(r);

  const promoPartsSent = countMatches(p, /(?:text|image) → sent$/gm);
  const promoPartsFailed = countMatches(p, /(?:text|image) → failed\b/gm);
  const promoPartsSkipped = countMatches(p, /(?:text|image) → skipped\b/gm);
  const promoNoneSending = /No promotions sending\./.test(p);
  const promoOutsideWindow = /outside 09:00–20:00/.test(p);
  const promoBudgetExhausted = /daily budget exhausted/.test(p);
  const promoAutoPaused = /auto-paused \(failure rate\)/.test(p);

  const parts = [];
  if (remindersNoneDue) parts.push("no reminders due");
  else parts.push(`reminders ${remindersSent} sent${remindersFailed ? `, ${remindersFailed} failed` : ""}`);
  if (promoNoneSending) parts.push("no promotions sending");
  else {
    let promo = `promo ${promoPartsSent} sent`;
    if (promoPartsFailed) promo += `, ${promoPartsFailed} failed`;
    if (promoPartsSkipped) promo += `, ${promoPartsSkipped} skipped`;
    if (promoOutsideWindow) promo += " (outside send window)";
    if (promoBudgetExhausted) promo += " (daily budget hit)";
    if (promoAutoPaused) promo += " (AUTO-PAUSED)";
    parts.push(promo);
  }

  return {
    remindersSent,
    remindersFailed,
    remindersNoneDue,
    promoPartsSent,
    promoPartsFailed,
    promoPartsSkipped,
    promoNoneSending,
    promoOutsideWindow,
    promoBudgetExhausted,
    promoAutoPaused,
    line: parts.join(" · "),
  };
}

function countMatches(text, re) {
  const m = String(text).match(re);
  return m ? m.length : 0;
}

/** Last `n` lines of a text blob (for the GUI log pane). */
export function tailLines(text, n) {
  const lines = String(text ?? "").split(/\r?\n/);
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return lines.slice(Math.max(0, lines.length - count)).join("\n");
}

/** `2026-09-09 17:40:12  message` — the log line format the GUI parses back. */
export function formatLogLine(date, message) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (x) => String(x).padStart(2, "0");
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${stamp}  ${message}`;
}
