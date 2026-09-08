"use server";

import { revalidatePath } from "next/cache";

import {
  EmployeeError,
  PromotionError,
  decidePermissionRequest,
  writeAudit,
} from "@/db/queries";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";

export async function decideRequestAction(formData: FormData): Promise<void> {
  const { user, gymId } = await requireOwnerGym();
  const id = String(formData.get("id") ?? "");
  const decision =
    String(formData.get("decision") ?? "") === "approved"
      ? "approved"
      : "rejected";

  try {
    await decidePermissionRequest({ id, gymId, decision, decidedBy: user.id });
    await writeAudit({
      actorUserId: user.id,
      actorRole: user.role,
      gymId,
      action: `approval.${decision}`,
      targetType: "permission_request",
      targetId: id,
    });
  } catch (error) {
    if (!(error instanceof EmployeeError) && !(error instanceof PromotionError)) {
      throw error;
    }
    // already decided / already submitted elsewhere — fall through to revalidate
  }
  revalidatePath("/owner/approvals");
  revalidatePath("/owner/members");
  revalidatePath("/owner/payments");
  revalidatePath("/owner/promotions");
}
