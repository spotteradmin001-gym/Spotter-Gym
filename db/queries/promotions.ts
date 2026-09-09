import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { gyms, promotionRecipients, promotions } from "@/db/schema";
import { estimate, partsPerRecipient } from "@/lib/promo-cost";
import { PromoMediaError, uploadPromoImage } from "@/lib/promo-media";

/** Caller-facing failures; the server-action layer maps this to user copy. */
export class PromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionError";
  }
}

export type PromotionStatus =
  | "draft"
  | "submitted"
  | "priced"
  | "approved"
  | "paid"
  | "sending"
  | "sent"
  | "partly_failed"
  | "failed"
  | "rejected"
  | "cancelled";

export type PromotionSettlement = "none" | "settled" | "refund_due" | "refunded";

export type PartStatus = "pending" | "sent" | "failed" | "skipped" | "n/a";

export type RecipientSource = "member" | "contact";

export type Promotion = {
  id: string;
  gymId: string;
  createdByUserId: string | null;
  body: string | null;
  imageDriveFileId: string | null;
  imageMime: string | null;
  hasText: boolean;
  hasImage: boolean;
  status: PromotionStatus;
  settlement: PromotionSettlement;
  recipientCount: number;
  perMessagePaise: number | null;
  estimatedTotalPaise: number | null;
  prepaidPaise: number | null;
  billedTotalPaise: number | null;
  refundPaise: number | null;
  adminNote: string | null;
  pausedAt: string | null;
  pauseReason: string | null;
  submittedAt: string | null;
  pricedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  sentAt: string | null;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromotionRecipient = {
  id: string;
  promotionId: string;
  phone: string;
  memberId: string | null;
  source: RecipientSource;
  waExists: boolean | null;
  textStatus: PartStatus;
  textWahaId: string | null;
  textError: string | null;
  imageStatus: PartStatus;
  imageWahaId: string | null;
  imageError: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Every `promotions` column **except `image_bytes`**. Read queries use this so a
 * `SELECT` never drags up to 5 MB of blob per row (a list endpoint would pull
 * one per row). The only place that reads `image_bytes` is `fetchPromoImage` in
 * `lib/promo-media.ts`.
 */
const promotionColumns = {
  id: promotions.id,
  gymId: promotions.gymId,
  createdByUserId: promotions.createdByUserId,
  body: promotions.body,
  imageDriveFileId: promotions.imageDriveFileId,
  imageMime: promotions.imageMime,
  imageStoredAt: promotions.imageStoredAt,
  imageDeletedAt: promotions.imageDeletedAt,
  hasText: promotions.hasText,
  hasImage: promotions.hasImage,
  status: promotions.status,
  settlement: promotions.settlement,
  recipientCount: promotions.recipientCount,
  perMessagePaise: promotions.perMessagePaise,
  estimatedTotalPaise: promotions.estimatedTotalPaise,
  prepaidPaise: promotions.prepaidPaise,
  billedTotalPaise: promotions.billedTotalPaise,
  refundPaise: promotions.refundPaise,
  adminNote: promotions.adminNote,
  pausedAt: promotions.pausedAt,
  pauseReason: promotions.pauseReason,
  submittedAt: promotions.submittedAt,
  pricedAt: promotions.pricedAt,
  approvedAt: promotions.approvedAt,
  paidAt: promotions.paidAt,
  sentAt: promotions.sentAt,
  reconciledAt: promotions.reconciledAt,
  createdAt: promotions.createdAt,
  updatedAt: promotions.updatedAt,
} as const;

type PromotionRow = Omit<typeof promotions.$inferSelect, "imageBytes">;

function mapPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    gymId: row.gymId,
    createdByUserId: row.createdByUserId ?? null,
    body: row.body ?? null,
    imageDriveFileId: row.imageDriveFileId ?? null,
    imageMime: row.imageMime ?? null,
    hasText: row.hasText,
    hasImage: row.hasImage,
    status: row.status as PromotionStatus,
    settlement: row.settlement as PromotionSettlement,
    recipientCount: row.recipientCount,
    perMessagePaise: row.perMessagePaise ?? null,
    estimatedTotalPaise: row.estimatedTotalPaise ?? null,
    prepaidPaise: row.prepaidPaise ?? null,
    billedTotalPaise: row.billedTotalPaise ?? null,
    refundPaise: row.refundPaise ?? null,
    adminNote: row.adminNote ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    pauseReason: row.pauseReason ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    pricedAt: row.pricedAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapRecipient(
  row: typeof promotionRecipients.$inferSelect,
): PromotionRecipient {
  return {
    id: row.id,
    promotionId: row.promotionId,
    phone: row.phone,
    memberId: row.memberId ?? null,
    source: row.source as RecipientSource,
    waExists: row.waExists ?? null,
    textStatus: row.textStatus as PartStatus,
    textWahaId: row.textWahaId ?? null,
    textError: row.textError ?? null,
    imageStatus: row.imageStatus as PartStatus,
    imageWahaId: row.imageWahaId ?? null,
    imageError: row.imageError ?? null,
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Create a `draft` promotion. When `imageBytes` is supplied the bytes are
 * stored inline on the new row via `uploadPromoImage` (R.4) — validation
 * (type + 5 MB ceiling) happens there and surfaces as a `PromotionError`.
 */
export async function createPromotionDraft(input: {
  gymId: string;
  createdByUserId?: string | null;
  body?: string | null;
  imageBytes?: Buffer | Uint8Array | null;
  imageMime?: string | null;
}): Promise<Promotion> {
  const body = input.body?.trim() || null;
  const imageBytes = input.imageBytes ?? null;
  if (!body && !imageBytes) {
    throw new PromotionError("A promotion needs a message, an image, or both.");
  }

  const [row] = await db
    .insert(promotions)
    .values({
      gymId: input.gymId,
      createdByUserId: input.createdByUserId ?? null,
      body,
      hasText: body !== null,
      hasImage: false,
    })
    .returning();

  if (!imageBytes) return mapPromotion(row!);

  try {
    await uploadPromoImage(row!.id, imageBytes, input.imageMime?.trim() || "");
  } catch (error) {
    if (error instanceof PromoMediaError) throw new PromotionError(error.message);
    throw error;
  }
  const [withImage] = await db
    .select(promotionColumns)
    .from(promotions)
    .where(eq(promotions.id, row!.id))
    .limit(1);
  return mapPromotion(withImage!);
}

export async function getPromotion(id: string): Promise<Promotion | null> {
  const [row] = await db
    .select(promotionColumns)
    .from(promotions)
    .where(eq(promotions.id, id))
    .limit(1);
  return row ? mapPromotion(row) : null;
}

/** Gym-scoped lookup — the owner/employee portals never see another gym's rows. */
export async function getPromotionForGym(
  gymId: string,
  id: string,
): Promise<Promotion | null> {
  const [row] = await db
    .select(promotionColumns)
    .from(promotions)
    .where(and(eq(promotions.id, id), eq(promotions.gymId, gymId)))
    .limit(1);
  return row ? mapPromotion(row) : null;
}

export async function listPromotionsForGym(gymId: string): Promise<Promotion[]> {
  const rows = await db
    .select(promotionColumns)
    .from(promotions)
    .where(eq(promotions.gymId, gymId))
    .orderBy(desc(promotions.createdAt));
  return rows.map(mapPromotion);
}

/**
 * Promotions in one or more statuses across every gym — the admin queue
 * (`submitted`, `priced`, …) and the engine's work list (`sending`).
 */
export async function listPromotionsByStatus(
  status: PromotionStatus | PromotionStatus[],
): Promise<Promotion[]> {
  const list = Array.isArray(status) ? status : [status];
  if (list.length === 0) return [];
  const rows = await db
    .select(promotionColumns)
    .from(promotions)
    .where(inArray(promotions.status, list))
    .orderBy(desc(promotions.createdAt));
  return rows.map(mapPromotion);
}

export type RecipientInput = {
  phone: string;
  memberId?: string | null;
  source: RecipientSource;
};

/**
 * Replace a draft promotion's recipient list wholesale and refresh
 * `recipient_count`. Each part's status starts `pending` when the promotion
 * carries that part and `n/a` when it does not, so the engine and the status
 * views can read a recipient row without also loading the promotion.
 *
 * The recipient builder (normalise, dedupe, drop member-matches, the warning
 * banner) lands in Batch F.3; this just persists the resolved list.
 */
export async function replacePromotionRecipients(
  promotionId: string,
  recipients: RecipientInput[],
): Promise<number> {
  const promo = await getPromotion(promotionId);
  if (!promo) throw new PromotionError("That promotion no longer exists.");

  const seen = new Set<string>();
  const rows = recipients
    .map((r) => ({ ...r, phone: r.phone.trim() }))
    .filter((r) => {
      if (!r.phone || seen.has(r.phone)) return false;
      seen.add(r.phone);
      return true;
    })
    .map((r) => ({
      promotionId,
      phone: r.phone,
      memberId: r.memberId ?? null,
      source: r.source,
      textStatus: (promo.hasText ? "pending" : "n/a") as PartStatus,
      imageStatus: (promo.hasImage ? "pending" : "n/a") as PartStatus,
    }));

  await db
    .delete(promotionRecipients)
    .where(eq(promotionRecipients.promotionId, promotionId));
  if (rows.length > 0) {
    await db.insert(promotionRecipients).values(rows);
  }
  await db
    .update(promotions)
    .set({ recipientCount: rows.length, updatedAt: new Date() })
    .where(eq(promotions.id, promotionId));

  return rows.length;
}

export async function listPromotionRecipients(
  promotionId: string,
): Promise<PromotionRecipient[]> {
  const rows = await db
    .select()
    .from(promotionRecipients)
    .where(eq(promotionRecipients.promotionId, promotionId))
    .orderBy(asc(promotionRecipients.createdAt));
  return rows.map(mapRecipient);
}

// ─────────────────────────────────────────────────────────────────────────────
// State transitions — owner + employee side. Admin transitions (price, reject,
// mark paid, send, refund) land in Batch F.5.
// ─────────────────────────────────────────────────────────────────────────────

async function loadForTransition(
  gymId: string,
  promotionId: string,
): Promise<Promotion> {
  const promo = await getPromotionForGym(gymId, promotionId);
  if (!promo) throw new PromotionError("That promotion no longer exists.");
  return promo;
}

/**
 * Draft → submitted. Requires content and at least one recipient. Called by the
 * owner action directly and, for an approval-gated employee, by
 * `decidePermissionRequest` once the owner approves.
 */
export async function submitPromotion(input: {
  gymId: string;
  promotionId: string;
}): Promise<Promotion> {
  const promo = await loadForTransition(input.gymId, input.promotionId);
  if (promo.status !== "draft") {
    throw new PromotionError("This promotion has already been submitted.");
  }
  if (!promo.hasText && !promo.hasImage) {
    throw new PromotionError("Add a message or an image before submitting.");
  }
  if (promo.recipientCount < 1) {
    throw new PromotionError("Add at least one recipient before submitting.");
  }
  const [row] = await db
    .update(promotions)
    .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(promotions.id, input.promotionId), eq(promotions.status, "draft")),
    )
    .returning();
  if (!row) throw new PromotionError("This promotion has already been submitted.");
  return mapPromotion(row);
}

/**
 * Owner approves the admin's estimate: priced → approved. Owner-only — the
 * money steps are never reachable by an employee (enforced at the action layer).
 */
export async function approvePromotionEstimate(input: {
  gymId: string;
  promotionId: string;
}): Promise<Promotion> {
  const promo = await loadForTransition(input.gymId, input.promotionId);
  if (promo.status !== "priced") {
    throw new PromotionError(
      "This promotion is not waiting for estimate approval.",
    );
  }
  const [row] = await db
    .update(promotions)
    .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(promotions.id, input.promotionId), eq(promotions.status, "priced")),
    )
    .returning();
  if (!row) {
    throw new PromotionError(
      "This promotion is not waiting for estimate approval.",
    );
  }
  return mapPromotion(row);
}

/**
 * Owner records that they have prepaid the estimate offline. The promotion
 * stays `approved` — the admin flips it to `paid` once the money lands —
 * but `prepaid_paise` is set to the estimate so the admin sees the
 * acknowledged amount.
 */
export async function acknowledgePromotionPrepaid(input: {
  gymId: string;
  promotionId: string;
}): Promise<Promotion> {
  const promo = await loadForTransition(input.gymId, input.promotionId);
  if (promo.status !== "approved") {
    throw new PromotionError("Approve the estimate before marking it prepaid.");
  }
  if (promo.estimatedTotalPaise == null) {
    throw new PromotionError("This promotion has no estimate yet.");
  }
  const [row] = await db
    .update(promotions)
    .set({ prepaidPaise: promo.estimatedTotalPaise, updatedAt: new Date() })
    .where(eq(promotions.id, input.promotionId))
    .returning();
  return mapPromotion(row!);
}

const CANCELLABLE_STATUSES: PromotionStatus[] = [
  "draft",
  "submitted",
  "priced",
  "approved",
];

/** Owner (or the creating employee) withdraws a promotion before it is paid. */
export async function cancelPromotion(input: {
  gymId: string;
  promotionId: string;
}): Promise<Promotion> {
  const promo = await loadForTransition(input.gymId, input.promotionId);
  if (!CANCELLABLE_STATUSES.includes(promo.status)) {
    throw new PromotionError("This promotion can no longer be cancelled.");
  }
  const [row] = await db
    .update(promotions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(promotions.id, input.promotionId),
        inArray(promotions.status, CANCELLABLE_STATUSES),
      ),
    )
    .returning();
  if (!row) throw new PromotionError("This promotion can no longer be cancelled.");
  return mapPromotion(row);
}

/** Promotions one user composed — the employee portal's own list. */
export async function listPromotionsCreatedBy(
  gymId: string,
  userId: string,
): Promise<Promotion[]> {
  const rows = await db
    .select(promotionColumns)
    .from(promotions)
    .where(
      and(
        eq(promotions.gymId, gymId),
        eq(promotions.createdByUserId, userId),
      ),
    )
    .orderBy(desc(promotions.createdAt));
  return rows.map(mapPromotion);
}

export type PromotionRecipientTally = {
  total: number;
  textSent: number;
  textFailed: number;
  textSkipped: number;
  textPending: number;
  imageSent: number;
  imageFailed: number;
  imageSkipped: number;
  imagePending: number;
  /** Parts across all recipients with status 'sent' — the billed-part count. */
  deliveredParts: number;
};

/** Per-part counts for one promotion — feeds the status view and reconcile maths. */
export async function promotionRecipientTally(
  promotionId: string,
): Promise<PromotionRecipientTally> {
  const recips = await listPromotionRecipients(promotionId);
  const t: PromotionRecipientTally = {
    total: recips.length,
    textSent: 0,
    textFailed: 0,
    textSkipped: 0,
    textPending: 0,
    imageSent: 0,
    imageFailed: 0,
    imageSkipped: 0,
    imagePending: 0,
    deliveredParts: 0,
  };
  for (const r of recips) {
    if (r.textStatus === "sent") {
      t.textSent++;
      t.deliveredParts++;
    } else if (r.textStatus === "failed") t.textFailed++;
    else if (r.textStatus === "skipped") t.textSkipped++;
    else if (r.textStatus === "pending") t.textPending++;

    if (r.imageStatus === "sent") {
      t.imageSent++;
      t.deliveredParts++;
    } else if (r.imageStatus === "failed") t.imageFailed++;
    else if (r.imageStatus === "skipped") t.imageSkipped++;
    else if (r.imageStatus === "pending") t.imagePending++;
  }
  return t;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin transitions (Batch F.5). Not gym-scoped — the platform admin works
// across every gym. Role is enforced at the action layer.
// ─────────────────────────────────────────────────────────────────────────────

async function loadPromotionOrThrow(id: string): Promise<Promotion> {
  const promo = await getPromotion(id);
  if (!promo) throw new PromotionError("That promotion no longer exists.");
  return promo;
}

/**
 * Admin prices a submitted promotion. `perMessagePaise` is the charge for one
 * delivered part; the estimate is `perMessagePaise × parts × recipients`
 * (`lib/promo-cost`). submitted → priced.
 */
export async function pricePromotion(input: {
  promotionId: string;
  perMessagePaise: number;
}): Promise<Promotion> {
  const promo = await loadPromotionOrThrow(input.promotionId);
  if (promo.status !== "submitted") {
    throw new PromotionError("Only a submitted promotion can be priced.");
  }
  const quote = estimate({
    perMessagePaise: input.perMessagePaise,
    parts: { hasText: promo.hasText, hasImage: promo.hasImage },
    recipientCount: promo.recipientCount,
  });
  const [row] = await db
    .update(promotions)
    .set({
      status: "priced",
      perMessagePaise: input.perMessagePaise,
      estimatedTotalPaise: quote.estimatedTotalPaise,
      pricedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(promotions.id, input.promotionId),
        eq(promotions.status, "submitted"),
      ),
    )
    .returning();
  if (!row) throw new PromotionError("Only a submitted promotion can be priced.");
  return mapPromotion(row);
}

const REJECTABLE_STATUSES: PromotionStatus[] = [
  "submitted",
  "priced",
  "approved",
];

/** Admin rejects a promotion before it is paid. */
export async function rejectPromotion(input: {
  promotionId: string;
  adminNote?: string | null;
}): Promise<Promotion> {
  const promo = await loadPromotionOrThrow(input.promotionId);
  if (!REJECTABLE_STATUSES.includes(promo.status)) {
    throw new PromotionError("This promotion can no longer be rejected.");
  }
  const [row] = await db
    .update(promotions)
    .set({
      status: "rejected",
      adminNote: input.adminNote?.trim() || promo.adminNote,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(promotions.id, input.promotionId),
        inArray(promotions.status, REJECTABLE_STATUSES),
      ),
    )
    .returning();
  if (!row) throw new PromotionError("This promotion can no longer be rejected.");
  return mapPromotion(row);
}

/**
 * Admin confirms the owner's offline prepayment has landed. approved → paid.
 * Requires the owner to have acknowledged prepaying (prepaid_paise set).
 */
export async function markPromotionPaid(input: {
  promotionId: string;
}): Promise<Promotion> {
  const promo = await loadPromotionOrThrow(input.promotionId);
  if (promo.status !== "approved") {
    throw new PromotionError("The owner has not approved the estimate yet.");
  }
  if (promo.prepaidPaise == null) {
    throw new PromotionError(
      "The owner has not marked the estimate as prepaid yet.",
    );
  }
  const [row] = await db
    .update(promotions)
    .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(promotions.id, input.promotionId), eq(promotions.status, "approved")),
    )
    .returning();
  if (!row) throw new PromotionError("The owner has not approved the estimate yet.");
  return mapPromotion(row);
}

/**
 * Admin releases a paid promotion to the engine. paid → sending. The engine
 * (Batch F.6) then works through `promotion_recipients` day by day.
 */
export async function startPromotionSending(input: {
  promotionId: string;
}): Promise<Promotion> {
  const promo = await loadPromotionOrThrow(input.promotionId);
  if (promo.status !== "paid") {
    throw new PromotionError("A promotion can only be sent once it is paid.");
  }
  const [row] = await db
    .update(promotions)
    .set({ status: "sending", updatedAt: new Date() })
    .where(
      and(eq(promotions.id, input.promotionId), eq(promotions.status, "paid")),
    )
    .returning();
  if (!row) throw new PromotionError("A promotion can only be sent once it is paid.");
  return mapPromotion(row);
}

/**
 * Admin marks the offline overpayment refund as done. The reconcile step
 * (Batch F.6) sets `settlement` to `refund_due`; this closes it to `refunded`.
 */
export async function markPromotionRefunded(input: {
  promotionId: string;
}): Promise<Promotion> {
  const promo = await loadPromotionOrThrow(input.promotionId);
  if (promo.settlement !== "refund_due") {
    throw new PromotionError("This promotion has no refund outstanding.");
  }
  const [row] = await db
    .update(promotions)
    .set({
      settlement: "refunded",
      reconciledAt: promo.reconciledAt ? undefined : new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(promotions.id, input.promotionId),
        eq(promotions.settlement, "refund_due"),
      ),
    )
    .returning();
  if (!row) throw new PromotionError("This promotion has no refund outstanding.");
  return mapPromotion(row);
}

export { partsPerRecipient };

export type PromotionWithGym = Promotion & {
  gymName: string;
  gymSlug: string;
};

/**
 * Every promotion (optionally filtered by status) with its gym name — the
 * admin queue. Ordered newest first.
 */
export async function listPromotionsWithGym(
  statuses?: PromotionStatus[],
): Promise<PromotionWithGym[]> {
  const rows = await db
    .select({ promotion: promotionColumns, gymName: gyms.name, gymSlug: gyms.slug })
    .from(promotions)
    .innerJoin(gyms, eq(gyms.id, promotions.gymId))
    .where(
      statuses && statuses.length > 0
        ? inArray(promotions.status, statuses)
        : undefined,
    )
    .orderBy(desc(promotions.createdAt));
  return rows.map((r) => ({
    ...mapPromotion(r.promotion),
    gymName: r.gymName,
    gymSlug: r.gymSlug,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview counters (Batch F.7)
// ─────────────────────────────────────────────────────────────────────────────

export type OwnerPromotionCounters = {
  /** Anything not yet in a terminal state. */
  inFlight: number;
  /** Waiting on the platform admin (submitted, or sending). */
  withAdmin: number;
  /** Waiting on the owner (priced → approve, or approved-not-prepaid). */
  needsOwnerAction: number;
  /** Currently being delivered by the engine. */
  sending: number;
  /** Finished sends with a refund the admin still owes. */
  refundDue: number;
};

/** In-flight promotion counters for the `/owner` overview. */
export async function ownerPromotionCounters(
  gymId: string,
): Promise<OwnerPromotionCounters> {
  const rows = await db
    .select({
      status: promotions.status,
      settlement: promotions.settlement,
      prepaidPaise: promotions.prepaidPaise,
    })
    .from(promotions)
    .where(eq(promotions.gymId, gymId));

  const c: OwnerPromotionCounters = {
    inFlight: 0,
    withAdmin: 0,
    needsOwnerAction: 0,
    sending: 0,
    refundDue: 0,
  };
  const IN_FLIGHT = new Set([
    "draft",
    "submitted",
    "priced",
    "approved",
    "paid",
    "sending",
  ]);
  for (const r of rows) {
    if (IN_FLIGHT.has(r.status)) c.inFlight++;
    if (r.status === "submitted" || r.status === "sending") c.withAdmin++;
    if (r.status === "sending") c.sending++;
    if (
      r.status === "priced" ||
      (r.status === "approved" && r.prepaidPaise == null)
    ) {
      c.needsOwnerAction++;
    }
    if (r.settlement === "refund_due") c.refundDue++;
  }
  return c;
}

export type AdminPromotionCounters = {
  submitted: number;
  priced: number;
  approved: number;
  paid: number;
  sending: number;
  refundDue: number;
  /** submitted + paid — the two states where the admin is the blocker. */
  needsAdminAction: number;
};

/** In-flight promotion counters across every gym for the `/admin` overview. */
export async function adminPromotionCounters(): Promise<AdminPromotionCounters> {
  const rows = await db
    .select({
      status: promotions.status,
      settlement: promotions.settlement,
      prepaidPaise: promotions.prepaidPaise,
    })
    .from(promotions);

  const c: AdminPromotionCounters = {
    submitted: 0,
    priced: 0,
    approved: 0,
    paid: 0,
    sending: 0,
    refundDue: 0,
    needsAdminAction: 0,
  };
  for (const r of rows) {
    if (r.status === "submitted") c.submitted++;
    else if (r.status === "priced") c.priced++;
    else if (r.status === "approved") c.approved++;
    else if (r.status === "paid") c.paid++;
    else if (r.status === "sending") c.sending++;
    if (r.settlement === "refund_due") c.refundDue++;
    if (
      r.status === "submitted" ||
      r.status === "paid" ||
      (r.status === "approved" && r.prepaidPaise != null) ||
      r.settlement === "refund_due"
    ) {
      c.needsAdminAction++;
    }
  }
  return c;
}
