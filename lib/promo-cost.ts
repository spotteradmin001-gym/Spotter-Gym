/**
 * Promotion cost maths (Phase F / CR-10) — pure, no I/O.
 *
 * Money is integer paise, the repo-wide convention. A promotion carries a text
 * part, an image part, or both; each part sent to one recipient is one
 * separately-billed message.
 *
 *   estimate  = per_message_paise * parts_per_recipient * recipient_count
 *   finalBill = per_message_paise * (parts across all recipients with
 *               status 'sent')            — delivered parts only
 *   refund    = prepaid_paise - billed_total_paise, never negative
 *
 * The final bill can only ever be <= the estimate, so the owner always prepays
 * enough and any shortfall is refunded offline.
 */

export class PromoCostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromoCostError";
  }
}

export type PromoParts = { hasText: boolean; hasImage: boolean };

/** Parts a single recipient is billed for: 0, 1 or 2. */
export function partsPerRecipient(parts: PromoParts): number {
  return (parts.hasText ? 1 : 0) + (parts.hasImage ? 1 : 0);
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new PromoCostError(`${label} must be a whole number of zero or more.`);
  }
}

export type PromoEstimate = {
  perMessagePaise: number;
  partsPerRecipient: number;
  recipientCount: number;
  /** parts_per_recipient * recipient_count */
  totalMessages: number;
  estimatedTotalPaise: number;
};

export function estimate(input: {
  perMessagePaise: number;
  parts: PromoParts;
  recipientCount: number;
}): PromoEstimate {
  assertNonNegativeInt(input.perMessagePaise, "The per-message charge");
  assertNonNegativeInt(input.recipientCount, "The recipient count");

  const per = partsPerRecipient(input.parts);
  if (per === 0) {
    throw new PromoCostError("A promotion needs a message, an image, or both.");
  }

  const totalMessages = per * input.recipientCount;
  return {
    perMessagePaise: input.perMessagePaise,
    partsPerRecipient: per,
    recipientCount: input.recipientCount,
    totalMessages,
    estimatedTotalPaise: totalMessages * input.perMessagePaise,
  };
}

export type PromoFinalBill = {
  perMessagePaise: number;
  deliveredParts: number;
  billedTotalPaise: number;
};

export function finalBill(input: {
  perMessagePaise: number;
  /** Count of recipient-parts whose status is 'sent'. */
  deliveredParts: number;
}): PromoFinalBill {
  assertNonNegativeInt(input.perMessagePaise, "The per-message charge");
  assertNonNegativeInt(input.deliveredParts, "The delivered-part count");

  return {
    perMessagePaise: input.perMessagePaise,
    deliveredParts: input.deliveredParts,
    billedTotalPaise: input.deliveredParts * input.perMessagePaise,
  };
}

/** prepaid - billed, floored at zero. */
export function refundPaise(
  prepaidPaise: number,
  billedTotalPaise: number,
): number {
  assertNonNegativeInt(prepaidPaise, "The prepaid amount");
  assertNonNegativeInt(billedTotalPaise, "The billed amount");
  return Math.max(0, prepaidPaise - billedTotalPaise);
}

export type PromoSettlement = "settled" | "refund_due";

/**
 * How the offline money reconciliation should land once a send finishes:
 * an exact match is `settled`, anything the owner overpaid is `refund_due`.
 */
export function settlementOutcome(
  prepaidPaise: number,
  billedTotalPaise: number,
): PromoSettlement {
  return refundPaise(prepaidPaise, billedTotalPaise) > 0
    ? "refund_due"
    : "settled";
}
