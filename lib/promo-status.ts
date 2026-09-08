/**
 * Display labels for the promotion state machine (Phase F / CR-10). Pure so
 * both server pages and client components can import it.
 */

export const PROMOTION_STATUSES = [
  "draft",
  "submitted",
  "priced",
  "approved",
  "paid",
  "sending",
  "sent",
  "partly_failed",
  "failed",
  "rejected",
  "cancelled",
] as const;

export type PromotionStatusName = (typeof PROMOTION_STATUSES)[number];

export const PROMOTION_STATUS_LABEL: Record<PromotionStatusName, string> = {
  draft: "Draft",
  submitted: "Awaiting admin review",
  priced: "Priced — approve the estimate",
  approved: "Approved — prepay the estimate",
  paid: "Paid — queued to send",
  sending: "Sending",
  sent: "Sent",
  partly_failed: "Sent (some parts failed)",
  failed: "Failed",
  rejected: "Rejected by admin",
  cancelled: "Cancelled",
};

export const PROMOTION_SETTLEMENT_LABEL: Record<string, string> = {
  none: "Not settled",
  settled: "Settled",
  refund_due: "Refund due",
  refunded: "Refunded",
};
