"use server";

import { revalidatePath } from "next/cache";

import {
  ConfigError,
  GymError,
  addProfileField,
  deleteProfileField,
  updateGym,
  updateProfileField,
  upsertTemplate,
  type GymPatch,
  type ProfileFieldType,
  type TemplateKind,
} from "@/db/queries";
import { rupeesToPaise } from "@/lib/money";
import { err, ok, type ActionState } from "@/lib/result";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";

function toMessage(error: unknown): string {
  if (error instanceof GymError || error instanceof ConfigError) {
    return error.message;
  }
  return "Something went wrong. Try again.";
}

function numOrUndef(v: FormDataEntryValue | null): number | undefined {
  const s = String(v ?? "").trim();
  if (s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export async function saveGymSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();

  const feeRupees = numOrUndef(formData.get("defaultMonthlyFeeRupees"));
  const patch: GymPatch = {
    name: String(formData.get("name") ?? "").trim() || undefined,
    timezone: String(formData.get("timezone") ?? "").trim() || undefined,
    address: (String(formData.get("address") ?? "").trim() || null) as string | null,
    geoLat: numOrUndef(formData.get("geoLat")) ?? null,
    geoLng: numOrUndef(formData.get("geoLng")) ?? null,
    checkinRadiusM: numOrUndef(formData.get("checkinRadiusM")),
    reminderDaysBefore: numOrUndef(formData.get("reminderDaysBefore")),
    billingAnchorDay: numOrUndef(formData.get("billingAnchorDay")),
    // wahaSessionName is admin-owned (CR-1) — the owner form no longer sends it.
    defaultMonthlyFeePaise:
      feeRupees === undefined ? null : rupeesToPaise(feeRupees),
  };
  const mode = String(formData.get("billingAnchorMode") ?? "");
  if (mode === "per_member" || mode === "fixed") patch.billingAnchorMode = mode;

  try {
    await updateGym(gymId, patch);
    revalidatePath("/owner/settings");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function saveTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();
  const kind = String(formData.get("kind") ?? "") as TemplateKind;
  const body = String(formData.get("body") ?? "");

  if (kind !== "pre_due" && kind !== "on_due") return err("Unknown template.");

  try {
    await upsertTemplate({ gymId, kind, body });
    revalidatePath("/owner/settings");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function addProfileFieldAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();
  try {
    await addProfileField({
      gymId,
      key: String(formData.get("key") ?? ""),
      label: String(formData.get("label") ?? ""),
      fieldType: String(formData.get("fieldType") ?? "text") as ProfileFieldType,
      required: formData.get("required") === "on",
    });
    revalidatePath("/owner/settings");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function deleteProfileFieldAction(formData: FormData): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await deleteProfileField(gymId, String(formData.get("id") ?? ""));
  revalidatePath("/owner/settings");
}

export async function toggleProfileFieldRequiredAction(
  formData: FormData,
): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await updateProfileField(gymId, String(formData.get("id") ?? ""), {
    required: String(formData.get("required") ?? "") === "true",
  });
  revalidatePath("/owner/settings");
}
