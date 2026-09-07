import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { gyms } from "./gyms";

/**
 * Per-gym owner configuration (Phase 3 Batch 3.1).
 *
 * `member_profile_fields` — the extra fields the owner wants every member to
 * fill in (blood group, emergency contact, …). `key` is the stable machine
 * name used in the member's `profile_json`; `label` is what the member sees.
 */
export const memberProfileFields = pgTable(
  "member_profile_fields",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    fieldType: text("field_type").notNull().default("text"),
    required: boolean("required").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("member_profile_fields_gym_key_unique").on(t.gymId, t.key),
    check(
      "member_profile_fields_type_check",
      sql`${t.fieldType} in ('text', 'number', 'date')`,
    ),
  ],
);

/**
 * WhatsApp reminder templates. One row per `(gym, kind)`. Placeholders
 * `{{name}}`, `{{amount}}`, `{{due_date}}` are filled by the reminder planner
 * (Phase 6).
 */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("message_templates_gym_kind_unique").on(t.gymId, t.kind),
    check(
      "message_templates_kind_check",
      sql`${t.kind} in ('pre_due', 'on_due')`,
    ),
  ],
);
