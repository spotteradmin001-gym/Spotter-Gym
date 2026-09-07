/**
 * Environment contract for the database layer.
 *
 * `DATABASE_URL` is the pooled Neon connection string (pgbouncer) used by the
 * running app. `DATABASE_URL_UNPOOLED` is the direct connection required for
 * DDL — pgbouncer in transaction mode cannot run migrations — so drizzle-kit
 * and `db/migrate.ts` use it.
 *
 * Env population is the caller's job: the Next app has `.env*` loaded by Next,
 * vitest by `vitest.config.ts`, and the standalone scripts (`db/migrate.ts`,
 * `drizzle.config.ts`) import `./load-env` themselves. This module never
 * touches the filesystem, so importing it into a Server Component doesn't drag
 * `node:fs` and a whole-project trace into the serverless bundle.
 */

/**
 * Pooled connection string for the app runtime.
 *
 * @throws when `DATABASE_URL` is unset — naming where the local value comes from
 * (`vercel env pull` writes `.env.local`).
 */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run `vercel env pull .env.local` at the repo " +
        "root (or copy .env.example to .env.local and fill it), then re-run.",
    );
  }

  return url;
}

/**
 * Direct (unpooled) connection string for migrations and other DDL.
 * Falls back to the pooled URL only if the unpooled one is absent, so a
 * misconfigured environment still surfaces a connection error rather than
 * silently doing nothing.
 */
export function getMigrationUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED?.trim();
  return url || getDatabaseUrl();
}
