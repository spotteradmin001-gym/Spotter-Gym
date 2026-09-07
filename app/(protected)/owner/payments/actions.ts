"use server";

import { revalidatePath } from "next/cache";

import { PaymentError, recordPayment } from "@/db/queries";
import { rupeesToPaise } from "@/lib/money";
import { err, ok, type ActionState } from "@/lib/result";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";

export async function recordPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, gymId } = await requireOwnerGym();

  const memberId = String(formData.get("memberId") ?? "");
  const rupees = Number(String(formData.get("amountRupees") ?? ""));
  const paidOn = String(formData.get("paidOn") ?? "");
  const method = String(formData.get("method") ?? "cash");
  const note = String(formData.get("note") ?? "");

  if (!memberId) return err("Pick a member.");
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return err("Enter an amount greater than zero.");
  }

  try {
    await recordPayment({
      gymId,
      memberId,
      amountPaise: rupeesToPaise(rupees),
      paidOn,
      method,
      note,
      recordedBy: user.id,
    });
    revalidatePath("/owner/payments");
    revalidatePath(`/owner/members/${memberId}`);
    return ok();
  } catch (error) {
    if (error instanceof PaymentError) return err(error.message);
    return err("Something went wrong. Try again.");
  }
}
