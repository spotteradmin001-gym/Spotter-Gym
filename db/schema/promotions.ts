import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { gyms } from "./gyms";
import { members } from "./members";

/** Raw binary column. `pg` reads/writes these as Node `Buffer`. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Paid bulk WhatsApp promotions (Phase F / CR-10).
 *
 * A promotion carries a text part, an image part, or both — each part sent to a
 * recipient is one separately-billed message. The owner (or an approved
 * employee) composes it; the platform admin reviews content and recipients,
 * prices it (`per_message_paise`), the owner prepays the estimate offline, the
 * admin marks it `paid`, then the local WAHA engine sends it — spread across
 * days, within the gym's daily cap and transactional reserve. Delivered parts
 * only are billed; any overpayment is refunded offline.
 *
 * Money is integer paise, the repo-wide convention. `estimated_total_paise`
 * = `per_message_paise * parts * recipient_count`; `billed_total_paise`
 * = `per_message_paise * count of parts with status 'sent'`;
 * `refund_paise` = `prepaid_paise - billed_total_paise` (never negative — the
 * real bill can only be <= the estimate).
 *
 * `status` state machine:
 *   draft -> submitted -> priced -> approved -> paid -> sending
 *     -> sent | partly_failed | failed
 *   and from most pre-send states: rejected | cancelled
 *
 * `settlement` tracks the offline money reconciliation once a send finishes:
 *   none -> settled (exact match) | refund_due -> refunded
 *
 * `paused_at` / `pause_reason` are set by the engine when a promotion's
 * failure rate spikes (an early ban signal, guardrail 7); the promotion stays
 * `sending` and an admin decides whether to resume or cancel.
 */
export const promotions = pgTable(
  "promotions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Content. `body` null = no text part; `has_text` / `has_image` are the
    // denormalised part flags the cost maths and the engine read.
    //
    // The image is stored inline as `image_bytes` (R.4) and is ephemeral: the
    // engine deletes it once the promotion reaches a terminal status, and a
    // daily purge nulls anything left behind. `image_stored_at` /
    // `image_deleted_at` track that lifecycle; `has_image` stays true after the
    // bytes are gone so the history still shows the promotion carried an image.
    // `image_drive_file_id` is a legacy column from the old Google Drive
    // backend — no longer written, kept because earlier migrations reference it.
    body: text("body"),
    imageDriveFileId: text("image_drive_file_id"),
    imageMime: text("image_mime"),
    imageBytes: bytea("image_bytes"),
    imageStoredAt: timestamp("image_stored_at", { withTimezone: true }),
    imageDeletedAt: timestamp("image_deleted_at", { withTimezone: true }),
    hasText: boolean("has_text").notNull().default(false),
    hasImage: boolean("has_image").notNull().default(false),
    status: text("status").notNull().default("draft"),
    settlement: text("settlement").notNull().default("none"),
    recipientCount: integer("recipient_count").notNull().default(0),
    perMessagePaise: integer("per_message_paise"),
    estimatedTotalPaise: integer("estimated_total_paise"),
    prepaidPaise: integer("prepaid_paise"),
    billedTotalPaise: integer("billed_total_paise"),
    refundPaise: integer("refund_paise"),
    adminNote: text("admin_note"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    pauseReason: text("pause_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    pricedAt: timestamp("priced_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "promotions_status_check",
      sql`${t.status} in ('draft', 'submitted', 'priced', 'approved', 'paid', 'sending', 'sent', 'partly_failed', 'failed', 'rejected', 'cancelled')`,
    ),
    check(
      "promotions_settlement_check",
      sql`${t.settlement} in ('none', 'settled', 'refund_due', 'refunded')`,
    ),
    check("promotions_recipient_count_check", sql`${t.recipientCount} >= 0`),
    check(
      "promotions_per_message_paise_check",
      sql`${t.perMessagePaise} is null or ${t.perMessagePaise} >= 0`,
    ),
    check(
      "promotions_estimated_total_paise_check",
      sql`${t.estimatedTotalPaise} is null or ${t.estimatedTotalPaise} >= 0`,
    ),
    check(
      "promotions_prepaid_paise_check",
      sql`${t.prepaidPaise} is null or ${t.prepaidPaise} >= 0`,
    ),
    check(
      "promotions_billed_total_paise_check",
      sql`${t.billedTotalPaise} is null or ${t.billedTotalPaise} >= 0`,
    ),
    check(
      "promotions_refund_paise_check",
      sql`${t.refundPaise} is null or ${t.refundPaise} >= 0`,
    ),
    index("promotions_gym_status_idx").on(t.gymId, t.status),
    index("promotions_status_idx").on(t.status),
    index("promotions_gym_created_idx").on(t.gymId, t.createdAt),
  ],
);

/**
 * One row per recipient per promotion. `source` distinguishes the gym's own
 * members from the owner's known contacts (only `contact`-source numbers get
 * the engine's WhatsApp-existence precheck; a member is assumed reachable).
 * `wa_exists` is null until the engine prechecks; false -> both parts are
 * `skipped` and never billed.
 *
 * Each part has its own status so "text delivered, image failed" is a real
 * state, billed for the text only:
 *   pending -> sent | failed | skipped
 *   n/a     — the promotion does not carry this part at all
 *
 * `unique(promotion_id, phone)` enforces the dedupe the recipient builder does
 * up front. `member_id` FK is `set null` so removing a member never drops the
 * send history.
 */
export const promotionRecipients = pgTable(
  "promotion_recipients",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    promotionId: text("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    memberId: text("member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull(),
    waExists: boolean("wa_exists"),
    textStatus: text("text_status").notNull().default("pending"),
    textWahaId: text("text_waha_id"),
    textError: text("text_error"),
    imageStatus: text("image_status").notNull().default("pending"),
    imageWahaId: text("image_waha_id"),
    imageError: text("image_error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("promotion_recipients_promotion_phone_unique").on(
      t.promotionId,
      t.phone,
    ),
    check("promotion_recipients_source_check", sql`${t.source} in ('member', 'contact')`),
    check(
      "promotion_recipients_text_status_check",
      sql`${t.textStatus} in ('pending', 'sent', 'failed', 'skipped', 'n/a')`,
    ),
    check(
      "promotion_recipients_image_status_check",
      sql`${t.imageStatus} in ('pending', 'sent', 'failed', 'skipped', 'n/a')`,
    ),
    index("promotion_recipients_promotion_idx").on(t.promotionId),
    index("promotion_recipients_promotion_text_status_idx").on(
      t.promotionId,
      t.textStatus,
    ),
  ],
);
