"use server";

import { revalidatePath } from "next/cache";

import {
  AuthError,
  acknowledgePromotionPrepaid,
  approvePromotionEstimate,
  cancelPromotion,
  createPromotionDraft,
  PromotionError,
  replacePromotionRecipients,
  submitPromotion,
  writeAudit,
} from "@/db/queries";
import { ActionError, err, ok, type ActionState } from "@/lib/result";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";
import { parseComposeForm } from "@/src/features/promotions/compose";
import type { ComposeOutcome } from "@/components/promotions/promotion-compose-form";

function toMessage(error: unknown): string {
  if (
    error instanceof ActionError ||
    error instanceof PromotionError ||
    error instanceof AuthError
  ) {
    return error.message;
  }
  return "Something went wrong. Try again.";
}

/** Owner composes a promotion and sends it straight to admin review. */
export async function composePromotionAction(
  _prev: ActionState<ComposeOutcome>,
  formData: FormData,
): Promise<ActionState<ComposeOutcome>> {
  let user, gymId;
  try {
    ({ user, gymId } = await requireOwnerGym());
  } catch (error) {
    return err(toMessage(error));
  }

  try {
    const parsed = await parseComposeForm(gymId, formData);
    const draft = await createPromotionDraft({
      gymId,
      createdByUserId: user.id,
      body: parsed.body,
      imageDriveFileId: parsed.imageDriveFileId,
      imageMime: parsed.imageMime,
    });
    await replacePromotionRecipients(draft.id, parsed.recipients);
    const submitted = await submitPromotion({ gymId, promotionId: draft.id });
    await writeAudit({
      actorUserId: user.id,
      actorRole: user.role,
      gymId,
      action: "promotion.submit",
      targetType: "promotion",
      targetId: submitted.id,
      meta: {
        recipientCount: submitted.recipientCount,
        hasText: submitted.hasText,
        hasImage: submitted.hasImage,
      },
    });
    revalidatePath("/owner/promotions");
    return ok({ pending: false, promotionId: submitted.id });
  } catch (error) {
    return err(toMessage(error));
  }
}

async function ownerPromotionMutation(
  formData: FormData,
  run: (gymId: string, promotionId: string) => Promise<void>,
  action: string,
): Promise<void> {
  const { user, gymId } = await requireOwnerGym();
  const promotionId = String(formData.get("promotionId") ?? "");
  try {
    await run(gymId, promotionId);
    await writeAudit({
      actorUserId: user.id,
      actorRole: user.role,
      gymId,
      action,
      targetType: "promotion",
      targetId: promotionId,
    });
  } catch (error) {
    if (!(error instanceof PromotionError)) throw error;
    // stale button (status already moved on) — fall through to revalidate
  }
  revalidatePath("/owner/promotions");
  revalidatePath(`/owner/promotions/${promotionId}`);
}

/** Owner-only: approve the admin's estimate (priced → approved). */
export async function approveEstimateAction(formData: FormData): Promise<void> {
  await ownerPromotionMutation(
    formData,
    (gymId, promotionId) =>
      approvePromotionEstimate({ gymId, promotionId }).then(() => undefined),
    "promotion.estimate_approved",
  );
}

/** Owner-only: acknowledge the estimate has been prepaid offline. */
export async function markPrepaidAction(formData: FormData): Promise<void> {
  await ownerPromotionMutation(
    formData,
    (gymId, promotionId) =>
      acknowledgePromotionPrepaid({ gymId, promotionId }).then(() => undefined),
    "promotion.prepaid_acknowledged",
  );
}

/** Owner withdraws a promotion before it is paid. */
export async function cancelPromotionAction(formData: FormData): Promise<void> {
  await ownerPromotionMutation(
    formData,
    (gymId, promotionId) =>
      cancelPromotion({ gymId, promotionId }).then(() => undefined),
    "promotion.cancelled",
  );
}
