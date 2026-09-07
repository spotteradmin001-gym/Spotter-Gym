/**
 * Applies every pending migration in db/migrations to the configured database,
 * over the direct (unpooled) connection — pgbouncer can't run DDL.
 *
 * Safe to re-run: drizzle records applied migrations in
 * `drizzle.__drizzle_migrations`, so a second run is a no-op.
 *
 * Run with: npm run db:migrate
 */
import "./load-env";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { getMigrationUrl } from "./env";

const MIGRATIONS_FOLDER = "./db/migrations";

/** Connection-level failures pg reports when nothing is listening. */
const CONNECTION_ERROR_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "EHOSTUNREACH"]);

/**
 * drizzle wraps driver failures in a DrizzleQueryError and Node's happy-eyeballs
 * dialer wraps the socket failure in an AggregateError, so the real code can sit
 * a couple of levels down. Walk both the `cause` chain and any `errors` array.
 */
function isConnectionError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 5) return false;
  const candidate = error as { code?: unknown; cause?: unknown; errors?: unknown };
  if (typeof candidate.code === "string" && CONNECTION_ERROR_CODES.has(candidate.code)) return true;
  if (Array.isArray(candidate.errors) && candidate.errors.some((e) => isConnectionError(e, depth + 1))) {
    return true;
  }
  return isConnectionError(candidate.cause, depth + 1);
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: getMigrationUrl() });
  try {
    console.log(`Applying migrations from ${MIGRATIONS_FOLDER} ...`);
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migrations applied. Database is up to date.");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error("Migration failed.");
    console.error(error);
    if (isConnectionError(error)) {
      console.error(
        "\nCould not reach the database. Check DATABASE_URL_UNPOOLED in " +
          ".env.local (run `vercel env pull .env.local`).",
      );
    }
    // Never swallow a failure: a partially migrated database must be loud.
    process.exit(1);
  });
