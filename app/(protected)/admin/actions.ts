"use server";

import { revalidatePath } from "next/cache";

import { AuthError } from "@/db/queries";
import {
  GymError,
  createGym,
  createOwnerForGym,
  getGym,
  setGymActive,
  setUserActive,
  updateGym,
  writeAudit,
} from "@/db/queries";
import { appUrl } from "@/lib/app-url";
import { err, ok, type ActionState } from "@/lib/result";
import { ownerWelcomeMessage } from "@/lib/wa-templates";
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
  const wahaSessionName = String(formData.get("wahaSessionName") ?? "");

  try {
    const gym = await createGym({
      name,
      timezone: timezone || undefined,
      wahaSessionName: wahaSessionName || undefined,
    });
    await writeAudit({
      actorUserId: admin.id,
      actorRole: "admin",
      gymId: gym.id,
      action: "gym.create",
      targetType: "gym",
      targetId: gym.id,
      meta: { name: gym.name, wahaSessionName: gym.wahaSessionName },
    });
    revalidatePath("/admin/gyms");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function updateGymWahaSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireUserForAction("admin");
  const gymId = String(formData.get("gymId") ?? "");
  const raw = String(formData.get("wahaSessionName") ?? "").trim();

  try {
    const gym = await getGym(gymId);
    if (!gym) throw new GymError("That gym no longer exists.");
    // Admin-owned and never blank — an empty box falls back to the gym slug.
    const wahaSessionName = raw || gym.slug;
    await updateGym(gymId, { wahaSessionName });
    await writeAudit({
      actorUserId: admin.id,
      actorRole: "admin",
      gymId,
      action: "gym.waha_session",
      targetType: "gym",
      targetId: gymId,
      meta: { wahaSessionName },
    });
    revalidatePath(`/admin/gyms/${gymId}`);
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export type CreateOwnerResult = {
  email: string;
  password: string;
  phone: string | null;
  shareMessage: string;
};

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
    const gym = await getGym(gymId);
    const shareMessage = ownerWelcomeMessage({
      gymName: gym?.name ?? "your gym",
      loginUrl: `${appUrl()}/login`,
      email: user.email,
      tempPassword: password,
    });
    revalidatePath(`/admin/gyms/${gymId}`);
    return ok({
      email: user.email,
      password,
      phone: user.phone ?? null,
      shareMessage,
    });
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
