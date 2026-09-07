/**
 * Creates the initial admin account (role `admin`, no gym,
 * `must_change_password = false` — it's handed real credentials up front).
 *
 * Idempotent: if an account with the target email already exists it does
 * nothing. Safe to run against any environment; run it once per database.
 *
 *   npm run db:seed-admin
 *
 * Email / password come from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD when set,
 * otherwise the committed defaults below. Change the password in-app after the
 * first sign-in.
 */
import "./load-env";

import { eq } from "drizzle-orm";

import { hashPassword, isPasswordStrongEnough } from "../src/features/auth/password";
import { closeDb, db } from "./client";
import { users } from "./schema";

const EMAIL = (process.env.SEED_ADMIN_EMAIL?.trim() || "spotter.admin001@gmail.com").toLowerCase();
const PASSWORD = process.env.SEED_ADMIN_PASSWORD?.trim() || "Startup#2026";

async function main(): Promise<void> {
  if (!isPasswordStrongEnough(PASSWORD)) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters.");
  }

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, EMAIL))
    .limit(1);

  if (existing) {
    console.log(
      `Account ${EMAIL} already exists (id ${existing.id}, role ${existing.role}). Nothing to do.`,
    );
    return;
  }

  const [row] = await db
    .insert(users)
    .values({
      email: EMAIL,
      role: "admin",
      gymId: null,
      passwordHash: hashPassword(PASSWORD),
      mustChangePassword: false,
    })
    .returning({ id: users.id });

  console.log(`Created admin ${EMAIL} (id ${row!.id}). Sign in and change the password.`);
}

main()
  .then(() => closeDb())
  .then(() => process.exit(0))
  .catch(async (error: unknown) => {
    console.error("Seed failed.");
    console.error(error);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
