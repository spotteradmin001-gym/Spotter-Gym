"use server";

import { revalidatePath } from "next/cache";

import { EmployeeError, decidePermissionRequest } from "@/db/queries";
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
  } catch (error) {
    if (!(error instanceof EmployeeError)) throw error;
    // already decided elsewhere — fall through to revalidate
  }
  revalidatePath("/owner/approvals");
  revalidatePath("/owner/members");
  revalidatePath("/owner/payments");
}
