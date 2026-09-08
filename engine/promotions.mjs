/**
 * Pure decision logic for the promotions runner (`send-promotions.mjs`). No DB,
 * no WAHA, no clock — everything is injected so this is unit-testable.
 * CR-10 guardrails 3–7 live here.
 */

/**
 * Messages a gym may still send as promotions today:
 *   waha_daily_cap − transactional_reserve − today's transactional sends
 *   − promo sends already made today
 * Floored at zero. Reminders + activation always take priority — that is what
 * the reserve protects.
 */
export function promoBudgetRemaining({
  dailyCap,
  reserve,
  transactionalToday,
  promoSentToday = 0,
}) {
  const n =
    Number(dailyCap) -
    Number(reserve) -
    Number(transactionalToday) -
    Number(promoSentToday);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** Randomised inter-send gap, 5–12 s by default (guardrail 6). */
export function randomGapMs(rng = Math.random, minMs = 5000, maxMs = 12000) {
  return Math.round(minMs + rng() * (maxMs - minMs));
}

/**
 * True when `now` is inside [startHour, endHour) in the gym's timezone
 * (default 09:00–20:00, guardrail 6). Falls back to the host clock if the
 * timezone is unusable.
 */
export function withinSendWindow(now, timeZone, startHour = 9, endHour = 20) {
  let hour;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(now);
    hour = Number(parts.find((p) => p.type === "hour")?.value);
  } catch {
    hour = now.getHours();
  }
  if (!Number.isFinite(hour)) hour = now.getHours();
  if (hour === 24) hour = 0; // some ICU builds emit "24" at midnight
  return hour >= startHour && hour < endHour;
}

/**
 * What to do with each part for one recipient, given the existence precheck.
 * `waExists === false` → both present parts `skip` (guardrail 3), never
 * charged. `waExists` null/true → present parts `send`.
 * Values: "send" | "skip" | "n/a".
 */
export function recipientPartPlan({ waExists, hasText, hasImage }) {
  const registered = waExists !== false;
  return {
    text: !hasText ? "n/a" : registered ? "send" : "skip",
    image: !hasImage ? "n/a" : registered ? "send" : "skip",
  };
}

const TERMINAL = new Set(["sent", "failed", "skipped", "n/a"]);

/** Every part of a recipient has reached a terminal state. */
export function recipientResolved({ textStatus, imageStatus }) {
  return TERMINAL.has(textStatus) && TERMINAL.has(imageStatus);
}

/**
 * Status of a part after one send attempt: a success is `sent`; a failure
 * retries (`pending`) until `maxAttempts`, then `failed`. Mirrors
 * `sender.mjs` `nextStatus` but named for the part columns.
 */
export function nextPartStatus({ attempts, ok, maxAttempts }) {
  const nextAttempts = attempts + 1;
  if (ok) return { status: "sent", attempts: nextAttempts };
  if (nextAttempts >= maxAttempts) {
    return { status: "failed", attempts: nextAttempts };
  }
  return { status: "pending", attempts: nextAttempts };
}

/**
 * Final promotion state once every recipient is resolved. Bills delivered
 * parts only (status `sent`); the refund is `prepaid − billed`, never
 * negative.
 */
export function promotionFinalState(recipientParts, { perMessagePaise, prepaidPaise }) {
  let deliveredParts = 0;
  let nonDelivered = 0;
  for (const r of recipientParts) {
    for (const s of [r.textStatus, r.imageStatus]) {
      if (s === "sent") deliveredParts += 1;
      else if (s === "failed" || s === "skipped") nonDelivered += 1;
    }
  }

  let status;
  if (deliveredParts > 0 && nonDelivered === 0) status = "sent";
  else if (deliveredParts === 0) status = "failed";
  else status = "partly_failed";

  const per = Number(perMessagePaise) || 0;
  const billedTotalPaise = deliveredParts * per;
  const refundPaise = Math.max(0, (Number(prepaidPaise) || 0) - billedTotalPaise);
  const settlement = refundPaise > 0 ? "refund_due" : "settled";

  return { status, deliveredParts, billedTotalPaise, refundPaise, settlement };
}

/**
 * Auto-pause trigger (guardrail 7): a failure-rate spike over a meaningful
 * sample within one run. `attempted` / `failed` count part-send attempts.
 */
export function shouldAutoPause({
  attempted,
  failed,
  minSample = 10,
  maxFailureRate = 0.5,
}) {
  if (attempted < minSample) return false;
  return failed / attempted >= maxFailureRate;
}
