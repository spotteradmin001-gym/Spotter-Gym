import "server-only";

/**
 * Best-effort in-memory sliding-window limiter for the login endpoint. Keyed by
 * `ip|email` so neither a single IP spraying many emails nor many IPs hammering
 * one account gets unlimited attempts.
 *
 * Caveat: state lives in one serverless instance's memory, so a determined
 * attacker spread across warm instances gets more than `MAX_ATTEMPTS` tries
 * total. That is acceptable for the pilot — it stops casual brute force and
 * accidental retry storms. A durable limiter (a `login_attempts` table or a
 * KV store) can replace this later without touching callers.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const hits = new Map<string, number[]>();

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

/** Records an attempt for `key` and reports whether it is now over the limit. */
export function hitRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup so the map doesn't grow without bound.
  if (hits.size > 5000) {
    for (const [k, times] of hits) {
      if (times.every((t) => t <= cutoff)) hits.delete(k);
    }
  }

  if (recent.length > MAX_ATTEMPTS) {
    const oldest = recent[0]!;
    return { ok: false, retryAfterSec: Math.ceil((oldest + WINDOW_MS - now) / 1000) };
  }
  return { ok: true };
}

/** Clears the counter for `key` — called after a successful login. */
export function resetRateLimit(key: string): void {
  hits.delete(key);
}

export { MAX_ATTEMPTS, WINDOW_MS };
