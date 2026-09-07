import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from "./session";

/**
 * The only place that writes, reads, or clears the session cookie. Login /
 * logout actions (Batch 1.2) and the guards call these instead of touching
 * `cookies()` directly, so the cookie's flags stay identical everywhere.
 *
 * `secure` is on only in production so local http dev still keeps you logged
 * in; `sameSite: "lax"` lets the cookie ride a top-level navigation back from
 * an email link (password reset, member invite) but not a cross-site POST.
 */

export async function setSessionCookie(sessionId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function readSessionCookie(): Promise<string> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? "";
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
