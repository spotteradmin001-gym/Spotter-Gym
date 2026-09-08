import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { gyms } from "./gyms";

export { EMPLOYEE_PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Gym employees (Phase 3 Batch 3.5). Each employee has a `users` row
 * (role 'employee') for their login plus this roster row. Granular
 * capabilities live in `employee_permissions`; the owner can also require
 * approval for some actions, which land in `permission_requests`.
 */
export const employees = pgTable(
  "employees",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("employees_user_unique").on(t.userId),
    index("employees_gym_idx").on(t.gymId),
  ],
);

export const employeePermissions = pgTable(
  "employee_permissions",
  {
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    /** When true, an employee's use of this permission waits for owner approval. */
    requiresApproval: boolean("requires_approval").notNull().default(false),
    grantedBy: text("granted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("employee_permissions_unique").on(t.employeeId, t.permission),
    check(
      "employee_permissions_permission_check",
      sql`${t.permission} in ('member.create', 'member.edit', 'payment.record', 'expense.create', 'expense.edit', 'promotion.create')`,
    ),
  ],
);

/**
 * A pending employee action, created when the employee does something a
 * `requiresApproval` permission covers. The write only happens when the owner
 * approves — `payload` carries everything the underlying query needs.
 */
export const permissionRequests = pgTable(
  "permission_requests",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "permission_requests_status_check",
      sql`${t.status} in ('pending', 'approved', 'rejected')`,
    ),
    check(
      "permission_requests_action_check",
      sql`${t.actionType} in ('member.create', 'member.edit', 'payment.record', 'expense.create', 'expense.edit', 'promotion.create')`,
    ),
    index("permission_requests_gym_status_idx").on(t.gymId, t.status),
  ],
);
