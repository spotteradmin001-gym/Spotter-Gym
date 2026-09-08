import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { users } from "./auth";

/**
 * Retrievable one-time staff credentials (Phase C / CR-6).
 *
 * When an admin creates an owner, or an owner creates an employee, the
 * generated one-time password is shown once on screen. This table lets an
 * authorised staff member re-open the record and see that password again —
 * but only until the account holder sets their own (`must_change_password`
 * flips to false), at which point the row is purged.
 *
 * Security posture: the scrypt hash in `users.password_hash` remains the ONLY
 * value used to authenticate. This is a separate, disposable convenience
 * store. The password is encrypted at rest with AES-256-GCM
 * (`lib/credential-crypto.ts`); the key lives only in the `CREDENTIAL_ENC_KEY`
 * env var, never in the database. When that key is unset the whole vault is a
 * no-op and nothing is written here.
 *
 * One row per user (`unique(user_id)`); `onDelete: cascade` so deleting the
 * user clears the stored credential.
 */
export const tempCredentials = pgTable(
  "temp_credentials",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("temp_credentials_user_id_unique").on(t.userId)],
);
