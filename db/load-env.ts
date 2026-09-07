/**
 * Loads local env files for standalone scripts (drizzle-kit, `tsx db/*.ts`,
 * vitest) without a `dotenv` dependency — Node's own `process.loadEnvFile`.
 *
 * Only fills gaps: if `DATABASE_URL` is already in the environment (Vercel build
 * and runtime, CI) nothing is read from disk, so the platform value always wins.
 * Locally, `.env.local` is what `vercel env pull` writes, so it takes precedence
 * over a hand-maintained `.env`.
 */
import { existsSync } from "node:fs";

if (!process.env.DATABASE_URL) {
  for (const file of [".env", ".env.local"]) {
    if (existsSync(file)) {
      try {
        process.loadEnvFile(file);
      } catch {
        // A malformed or unreadable env file must not crash tooling here;
        // db/env.ts throws a clear error later if DATABASE_URL is still missing.
      }
    }
  }
}
