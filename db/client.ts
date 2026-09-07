import "./load-env";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseUrl } from "./env";
import * as schema from "./schema";

/**
 * Lazily-created pg pool on the pooled Neon URL, reused across invocations in a
 * warm serverless function. Construction is deferred to the first query so that
 * importing `db` — which many modules do transitively — never reads
 * `DATABASE_URL` or opens a socket on a code path that doesn't touch the
 * database (a Server Component that only renders, a test file whose DB suite is
 * skipped, the production build's page-data collection).
 */
let poolInstance: Pool | undefined;
let dbInstance: NodePgDatabase<typeof schema> | undefined;

function connect(): NodePgDatabase<typeof schema> {
  if (!dbInstance) {
    poolInstance = new Pool({ connectionString: getDatabaseUrl() });
    dbInstance = drizzle(poolInstance, { schema });
  }
  return dbInstance;
}

/** Drizzle instance bound to the full schema. Connects on first use. */
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const real = connect();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/** Ends the pool so standalone scripts and test runs exit cleanly. No-op if it was never opened. */
export async function closeDb(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = undefined;
    dbInstance = undefined;
  }
}
