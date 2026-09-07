"use server";

import { revalidatePath } from "next/cache";

import {
  MemberError,
  listProfileFields,
  updateMemberProfile,
} from "@/db/queries";
import { err, ok, type ActionState } from "@/lib/result";
import { requireMemberSelf } from "@/src/features/auth/member-scope";

export async function saveProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { member } = await requireMemberSelf();
  const fields = await listProfileFields(member.gymId);

  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = String(formData.get(`f:${field.key}`) ?? "").trim();
    if (field.required && raw === "") {
      return err(`${field.label} is required.`);
    }
    values[field.key] = raw;
  }

  try {
    await updateMemberProfile(member.id, values);
    revalidatePath("/m/profile");
    revalidatePath("/m");
    return ok();
  } catch (error) {
    if (error instanceof MemberError) return err(error.message);
    return err("Something went wrong. Try again.");
  }
}
