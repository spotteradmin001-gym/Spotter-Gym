/**
 * Single source of truth for the session's lifetime and cookie name, shared by
 * the DB session layer (db/queries/auth.ts), the session-cookie helpers, and
 * every guard that reads the cookie. The cookie's Max-Age and the `sessions`
 * row's `expires_at` are both derived from `SESSION_DAYS` so they can never
 * drift apart.
 */

/** httpOnly cookie holding the opaque session id. Never readable by client JS. */
export const SESSION_COOKIE_NAME = "spotter_session";

/** How long a login lasts, in both the cookie Max-Age and the session row. */
export const SESSION_DAYS = 30;

/** Milliseconds a new session (and its cookie) stays valid from creation. */
export const SESSION_TTL_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
