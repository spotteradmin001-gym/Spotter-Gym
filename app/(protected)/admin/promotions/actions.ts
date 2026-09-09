"use server";

import { revalidatePath } from "next/cache";

import {
  PromotionError,
  adminForcePromotionPaid,
  markPromotionPaid,
  markPromotionRefunded,
  pricePromotion,
  rejectPromotion,
  startPromotionSending,
  writeAudit,
} from "@/db/queries";
import { err, ok, type ActionState } from "@/lib/result";
import { requireUserForAction } from "@/src/features/auth/guards";

function toMessage(error: unknown): string {
  if (error instanceof PromotionError) return error.message;
  return "Something went wrong. Try again.";
}

function revalidate(promotionId: string): void {
  revalidatePath("/admin/promotions");
  revalidatePath(`/admin/promotions/${promotionId}`);
}

export async function pricePromotionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireUserForAction("admin");
  const promotionId = String(formData.get("promotionId") ?? "");
  const perMessagePaise = Number(formData.get("perMessagePaise") ?? "");
  if (!Number.isInteger(perMessagePaise) || perMessagePaise < 0) {
    return err("Enter the per-message charge in whole paise.");
  }

  try {
    const priced = await pricePromotion({ promotionId, perMessagePaise });
    await writeAudit({
      actorUserId: admin.id,
      actorRole: "admin",
      gymId: priced.gymId,
      action: "promotion.priced",
      targetType: "promotion",
      targetId: promotionId,
      meta: {
        perMessagePaise,
        estimatedTotalPaise: priced.estimatedTotalPaise,
        recipientCount: priced.recipientCount,
      },
    });
    revalidate(promotionId);
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

/** Shared body for the plain-button transitions (reject / paid / send / refund). */
async function adminPromotionMutation(
  formData: FormData,
  run: (promotionId: string) => Promise<{ gymId: string }>,
  action: string,
  meta?: (formData: FormData) => Record<string, unknown>,
): Promise<void> {
  const admin = await requireUserForAction("admin");
  const promotionId = String(formData.get("promotionId") ?? "");
  try {
    const result = await run(promotionId);
    await writeAudit({
      actorUserId: admin.id,
      actorRole: "admin",
      gymId: result.gymId,
      action,
      targetType: "promotion",
      targetId: promotionId,
      meta: meta?.(formData),
    });
  } catch (error) {
    if (!(error instanceof PromotionError)) throw error;
    // stale button — status already moved on; fall through to revalidate
  }
  revalidate(promotionId);
}

export async function rejectPromotionAction(formData: FormData): Promise<void> {
  const adminNote = String(formData.get("adminNote") ?? "");
  await adminPromotionMutation(
    formData,
    (promotionId) => rejectPromotion({ promotionId, adminNote }),
    "promotion.rejected",
    () => (adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
  );
}

export async function markPromotionPaidAction(
  formData: FormData,
): Promise<void> {
  await adminPromotionMutation(
    formData,
    (promotionId) => markPromotionPaid({ promotionId }),
    "promotion.paid",
  );
}

/** CR-11: approve + mark prepaid + mark paid in one step, on the owner's behalf. */
export async function forcePromotionPaidAction(
  formData: FormData,
): Promise<void> {
  await adminPromotionMutation(
    formData,
    (promotionId) => adminForcePromotionPaid({ promotionId }),
    "promotion.paid_by_admin",
  );
}

export async function sendPromotionAction(formData: FormData): Promise<void> {
  await adminPromotionMutation(
    formData,
    (promotionId) => startPromotionSending({ promotionId }),
    "promotion.sending",
  );
}

export async function markPromotionRefundedAction(
  formData: FormData,
): Promise<void> {
  await adminPromotionMutation(
    formData,
    (promotionId) => markPromotionRefunded({ promotionId }),
    "promotion.refunded",
  );
}
