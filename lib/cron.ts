/**
 * Vercel Cron authorises its calls with `Authorization: Bearer $CRON_SECRET`
 * when that env var is set on the project. Locally, with no secret, allow the
 * call so `curl localhost` works; in production with no secret, refuse (a cron
 * endpoint must never be world-runnable in prod).
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
