import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Rotating check-in token for a gym's printed QR. It's an HMAC over
 * `gymId:windowStart` keyed by `SESSION_SECRET`, where `windowStart` is a 30-second
 * bucket. The owner's QR page refreshes it well within the window; a member's
 * scan is verified against the current and previous bucket (±1), so a token is
 * good for ~30–60s — long enough to walk in, too short to share a screenshot
 * later.
 */

const WINDOW_MS = 30_000;
const SKEW_WINDOWS = 1;

function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (!s) throw new Error("SESSION_SECRET is not set.");
  return s;
}

function sign(gymId: string, windowStart: number): string {
  return createHmac("sha256", secret())
    .update(`${gymId}:${windowStart}`)
    .digest("base64url");
}

export function currentCheckinToken(gymId: string, now = Date.now()): string {
  return sign(gymId, Math.floor(now / WINDOW_MS) * WINDOW_MS);
}

export function verifyCheckinToken(
  gymId: string,
  token: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const base = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  for (let i = 0; i <= SKEW_WINDOWS; i++) {
    for (const w of [base - i * WINDOW_MS, base + i * WINDOW_MS]) {
      const expected = sign(gymId, w);
      if (
        expected.length === token.length &&
        timingSafeEqual(Buffer.from(expected), Buffer.from(token))
      ) {
        return true;
      }
    }
  }
  return false;
}

export { WINDOW_MS };
