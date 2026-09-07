import "./load-env";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseUrl } from "./env";
import * as schema from "./schema";

/**
 * Raw pg pool on the pooled Neon URL. Reused across invocations in a warm
 * serverless function; scripts that open it must call `closeDb()` in a
 * `finally` so `tsx` can exit.
 */
export const pool = new Pool({ connectionString: getDatabaseUrl() });

/** Drizzle instance bound to the full schema. */
export const db = drizzle(pool, { schema });

/** Ends the pool so standalone scripts exit instead of hanging on the socket. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
