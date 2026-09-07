"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  MemberError,
  createMember,
  generateDuesForGym,
  setMemberFee,
  setMemberStatus,
  updateMember,
  type MemberStatus,
} from "@/db/queries";
import { rupeesToPaise } from "@/lib/money";
import { err, ok, type ActionState } from "@/lib/result";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";

function toMessage(error: unknown): string {
  if (error instanceof MemberError) return error.message;
  return "Something went wrong. Try again.";
}

function feePaiseFrom(form: FormData): number | null {
  const s = String(form.get("monthlyFeeRupees") ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return rupeesToPaise(n);
}

export async function createMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();
  const anchorRaw = String(formData.get("billingAnchorDay") ?? "").trim();

  let memberId: string;
  try {
    const member = await createMember({
      gymId,
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? "") || undefined,
      joinDate: String(formData.get("joinDate") ?? ""),
      monthlyFeePaise: feePaiseFrom(formData),
      billingAnchorDay: anchorRaw ? Number(anchorRaw) : undefined,
    });
    memberId = member.id;
  } catch (error) {
    return err(toMessage(error));
  }

  revalidatePath("/owner/members");
  redirect(`/owner/members/${memberId}`);
}

export async function updateMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();
  const id = String(formData.get("id") ?? "");
  const anchorRaw = String(formData.get("billingAnchorDay") ?? "").trim();

  try {
    await updateMember(gymId, id, {
      name: String(formData.get("name") ?? "") || undefined,
      phone: String(formData.get("phone") ?? "") || undefined,
      email: (String(formData.get("email") ?? "").trim() || null) as string | null,
      billingAnchorDay: anchorRaw ? Number(anchorRaw) : undefined,
    });
    revalidatePath(`/owner/members/${id}`);
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function regenerateDuesAction(): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await generateDuesForGym(gymId);
  revalidatePath("/owner/members");
}

export async function setMemberStatusAction(formData: FormData): Promise<void> {
  const { gymId } = await requireOwnerGym();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as MemberStatus;
  await setMemberStatus(gymId, id, status === "inactive" ? "inactive" : "active");
  revalidatePath("/owner/members");
  revalidatePath(`/owner/members/${id}`);
}

export async function setMemberFeeAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();
  const id = String(formData.get("id") ?? "");
  try {
    await setMemberFee(gymId, id, feePaiseFrom(formData));
    revalidatePath(`/owner/members/${id}`);
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}
