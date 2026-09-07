"use server";

import { revalidatePath } from "next/cache";

import { AuthError } from "@/db/queries";
import {
  GymError,
  createGym,
  createOwnerForGym,
  setGymActive,
  setUserActive,
} from "@/db/queries";
import { err, ok, type ActionState } from "@/lib/result";
import { requireUserForAction } from "@/src/features/auth/guards";

function toMessage(error: unknown): string {
  if (error instanceof AuthError || error instanceof GymError) return error.message;
  return "Something went wrong. Try again.";
}

export async function createGymAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUserForAction("admin");
  const name = String(formData.get("name") ?? "");
  const timezone = String(formData.get("timezone") ?? "");

  try {
    await createGym({ name, timezone: timezone || undefined });
    revalidatePath("/admin/gyms");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export type CreateOwnerResult = { email: string; password: string };

export async function createOwnerAction(
  _prev: ActionState<CreateOwnerResult>,
  formData: FormData,
): Promise<ActionState<CreateOwnerResult>> {
  await requireUserForAction("admin");
  const gymId = String(formData.get("gymId") ?? "");
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "");

  try {
    const { user, password } = await createOwnerForGym({
      gymId,
      email,
      phone: phone || undefined,
    });
    revalidatePath(`/admin/gyms/${gymId}`);
    return ok({ email: user.email, password });
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function setGymActiveAction(formData: FormData): Promise<void> {
  await requireUserForAction("admin");
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  await setGymActive({ id, isActive });
  revalidatePath("/admin/gyms");
  revalidatePath(`/admin/gyms/${id}`);
}

export async function setUserActiveAction(formData: FormData): Promise<void> {
  await requireUserForAction("admin");
  const id = String(formData.get("id") ?? "");
  const gymId = String(formData.get("gymId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  await setUserActive({ id, isActive });
  revalidatePath(`/admin/gyms/${gymId}`);
  revalidatePath(`/admin/gyms/${gymId}/users/${id}`);
}
