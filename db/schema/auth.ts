import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Phase 1 — login and the four roles.
 *
 * - `admin` is us: no gym, sees every gym.
 * - `owner`, `employee`, `member` each belong to exactly one gym via `gymId`.
 *   The `users_gym_scope_check` constraint enforces "admin ⇔ no gym, everyone
 *   else ⇔ a gym" at the database level.
 *
 * `gymId` has no foreign key yet — the `gyms` table lands in Phase 2 Batch
 * 2.1, which adds `ALTER TABLE users ADD CONSTRAINT users_gym_id_fk ...`.
 *
 * Password storage: scrypt, "saltHex:hashHex" (src/features/auth/password.ts).
 * `mustChangePassword` is set whenever staff create an account or reset its
 * password — the one-time value is shown once and never re-derivable — and is
 * cleared when the user picks their own. The seeded admin (Phase 2) is
 * inserted with it already false.
 *
 * No two-factor auth: the owner ruled out TOTP / 2FA for Spotter (2026-09-07).
 */
export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    gymId: text("gym_id"),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "users_role_check",
      sql`${t.role} in ('admin', 'owner', 'employee', 'member')`,
    ),
    check(
      "users_gym_scope_check",
      sql`(${t.role} = 'admin') = (${t.gymId} is null)`,
    ),
    index("users_gym_id_idx").on(t.gymId),
  ],
);

/**
 * DB-backed sessions rather than a stateless JWT: deleting a row here revokes
 * that login immediately, which is what "deactivate this account" and "reset
 * this password" rely on. The cookie only ever holds this row's id.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);
