import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { promotionRecipients, promotions } from "@/db/schema";

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

function mapPromotion(row: typeof promotions.$inferSelect): Promotion {
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
 * Create a `draft` promotion. Content validation, recipient building, the money
 * steps and the send state machine are layered on in later Phase F batches;
 * this is the base row.
 */
export async function createPromotionDraft(input: {
  gymId: string;
  createdByUserId?: string | null;
  body?: string | null;
  imageDriveFileId?: string | null;
  imageMime?: string | null;
}): Promise<Promotion> {
  const body = input.body?.trim() || null;
  const imageDriveFileId = input.imageDriveFileId?.trim() || null;
  if (!body && !imageDriveFileId) {
    throw new PromotionError("A promotion needs a message, an image, or both.");
  }

  const [row] = await db
    .insert(promotions)
    .values({
      gymId: input.gymId,
      createdByUserId: input.createdByUserId ?? null,
      body,
      imageDriveFileId,
      imageMime: imageDriveFileId ? (input.imageMime?.trim() || null) : null,
      hasText: body !== null,
      hasImage: imageDriveFileId !== null,
    })
    .returning();
  return mapPromotion(row!);
}

export async function getPromotion(id: string): Promise<Promotion | null> {
  const [row] = await db
    .select()
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
    .select()
    .from(promotions)
    .where(and(eq(promotions.id, id), eq(promotions.gymId, gymId)))
    .limit(1);
  return row ? mapPromotion(row) : null;
}

export async function listPromotionsForGym(gymId: string): Promise<Promotion[]> {
  const rows = await db
    .select()
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
    .select()
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
