"use server";

import { revalidatePath } from "next/cache";

import {
  AuthError,
  createPermissionRequest,
  createPromotionDraft,
  PromotionError,
  replacePromotionRecipients,
  submitPromotion,
  writeAudit,
} from "@/db/queries";
import { ActionError, err, ok, type ActionState } from "@/lib/result";
import { requireEmployeePermission } from "@/src/features/auth/employee-scope";
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

/**
 * Employee composes a promotion. The draft (with recipients + any image) is
 * always created; if the permission is approval-gated it waits as a
 * `permission_request` for the owner, otherwise it goes straight to admin
 * review. An employee can never reach the money steps.
 */
export async function composePromotionOrRequestAction(
  _prev: ActionState<ComposeOutcome>,
  formData: FormData,
): Promise<ActionState<ComposeOutcome>> {
  let gate;
  try {
    gate = await requireEmployeePermission("promotion.create");
  } catch (error) {
    return err(toMessage(error));
  }
  const { ctx, requiresApproval } = gate;

  try {
    const parsed = await parseComposeForm(ctx.gymId, formData);
    const draft = await createPromotionDraft({
      gymId: ctx.gymId,
      createdByUserId: ctx.user.id,
      body: parsed.body,
      imageBytes: parsed.imageBytes,
      imageMime: parsed.imageMime,
    });
    await replacePromotionRecipients(draft.id, parsed.recipients);

    if (requiresApproval) {
      const requestId = await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "promotion.create",
        payload: { promotionId: draft.id },
      });
      await writeAudit({
        actorUserId: ctx.user.id,
        actorRole: "employee",
        gymId: ctx.gymId,
        action: "permission_request.filed",
        targetType: "permission_request",
        targetId: requestId,
        meta: { actionType: "promotion.create" },
      });
      revalidatePath("/employee/promotions");
      return ok({ pending: true, promotionId: draft.id });
    }

    const submitted = await submitPromotion({
      gymId: ctx.gymId,
      promotionId: draft.id,
    });
    await writeAudit({
      actorUserId: ctx.user.id,
      actorRole: "employee",
      gymId: ctx.gymId,
      action: "promotion.submit",
      targetType: "promotion",
      targetId: submitted.id,
      meta: { recipientCount: submitted.recipientCount },
    });
    revalidatePath("/employee/promotions");
    return ok({ pending: false, promotionId: submitted.id });
  } catch (error) {
    return err(toMessage(error));
  }
}
