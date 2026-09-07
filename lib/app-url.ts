/**
 * The app's public base URL, for building absolute links in emails.
 *
 * Prefers an explicit `APP_URL`. On Vercel, falls back to the project's
 * production domain (`VERCEL_PROJECT_PRODUCTION_URL`) so a preview deploy still
 * emails a link that lands on production rather than on an ephemeral preview
 * URL. Local default is `http://localhost:3000`.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
