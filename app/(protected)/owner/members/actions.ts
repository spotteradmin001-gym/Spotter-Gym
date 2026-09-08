"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  AuthError,
  MemberError,
  createMember,
  createMemberActivationToken,
  generateDuesForGym,
  setMemberFee,
  setMemberStatus,
  updateMember,
  writeAudit,
  type MemberStatus,
} from "@/db/queries";
import { appUrl } from "@/lib/app-url";
import { MailSendError, sendMail } from "@/lib/mail";
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
  const { user, gymId } = await requireOwnerGym();
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

  await writeAudit({
    actorUserId: user.id,
    actorRole: user.role,
    gymId,
    action: "member.create",
    targetType: "member",
    targetId: memberId,
  });
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

export type ActivationLinkResult = { link: string; emailed: boolean };

export async function sendActivationLinkAction(
  _prev: ActionState<ActivationLinkResult>,
  formData: FormData,
): Promise<ActionState<ActivationLinkResult>> {
  const { gymId } = await requireOwnerGym();
  const memberId = String(formData.get("memberId") ?? "");

  let token: string;
  let email: string | null;
  try {
    const result = await createMemberActivationToken(gymId, memberId);
    token = result.token;
    email = result.member.email;
  } catch (error) {
    if (error instanceof AuthError) return err(error.message);
    return err("Something went wrong. Try again.");
  }

  const link = `${appUrl()}/activate/${token}`;
  let emailed = false;
  if (email) {
    try {
      await sendMail({
        to: email,
        subject: "Set up your Spotter login",
        text:
          "Your gym has invited you to Spotter. Open this link to choose a " +
          `password (valid for 7 days):\n${link}`,
      });
      emailed = true;
    } catch (error) {
      if (!(error instanceof MailSendError)) throw error;
    }
  }
  return ok({ link, emailed });
}

export async function regenerateDuesAction(): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await generateDuesForGym(gymId);
  revalidatePath("/owner/members");
}

export async function setMemberStatusAction(formData: FormData): Promise<void> {
  const { user, gymId } = await requireOwnerGym();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as MemberStatus;
  const next = status === "inactive" ? "inactive" : "active";
  await setMemberStatus(gymId, id, next);
  await writeAudit({
    actorUserId: user.id,
    actorRole: user.role,
    gymId,
    action: "member.status",
    targetType: "member",
    targetId: id,
    meta: { status: next },
  });
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
