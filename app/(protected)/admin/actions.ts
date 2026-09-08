"use server";

import { revalidatePath } from "next/cache";

import { AuthError } from "@/db/queries";
import {
  GymError,
  createGym,
  createOwnerForGym,
  setGymActive,
  setUserActive,
  writeAudit,
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
  const admin = await requireUserForAction("admin");
  const name = String(formData.get("name") ?? "");
  const timezone = String(formData.get("timezone") ?? "");

  try {
    const gym = await createGym({ name, timezone: timezone || undefined });
    await writeAudit({
      actorUserId: admin.id,
      actorRole: "admin",
      gymId: gym.id,
      action: "gym.create",
      targetType: "gym",
      targetId: gym.id,
      meta: { name: gym.name },
    });
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
  const admin = await requireUserForAction("admin");
  const gymId = String(formData.get("gymId") ?? "");
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "");

  try {
    const { user, password } = await createOwnerForGym({
      gymId,
      email,
      phone: phone || undefined,
    });
    await writeAudit({
      actorUserId: admin.id,
      actorRole: "admin",
      gymId,
      action: "owner.create",
      targetType: "user",
      targetId: user.id,
      meta: { email: user.email },
    });
    revalidatePath(`/admin/gyms/${gymId}`);
    return ok({ email: user.email, password });
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function setGymActiveAction(formData: FormData): Promise<void> {
  const admin = await requireUserForAction("admin");
  const id = String(formData.get("id") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  await setGymActive({ id, isActive });
  await writeAudit({
    actorUserId: admin.id,
    actorRole: "admin",
    gymId: id,
    action: "gym.active",
    targetType: "gym",
    targetId: id,
    meta: { isActive },
  });
  revalidatePath("/admin/gyms");
  revalidatePath(`/admin/gyms/${id}`);
}

export async function setUserActiveAction(formData: FormData): Promise<void> {
  const admin = await requireUserForAction("admin");
  const id = String(formData.get("id") ?? "");
  const gymId = String(formData.get("gymId") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "true";
  await setUserActive({ id, isActive });
  await writeAudit({
    actorUserId: admin.id,
    actorRole: "admin",
    gymId,
    action: "user.active",
    targetType: "user",
    targetId: id,
    meta: { isActive },
  });
  revalidatePath(`/admin/gyms/${gymId}`);
  revalidatePath(`/admin/gyms/${gymId}/users/${id}`);
}
