"use server";

import { revalidatePath } from "next/cache";

import {
  ReminderError,
  queueImmediateReminder,
  requeueReminderJob,
} from "@/db/queries";
import { err, ok, type ActionState } from "@/lib/result";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";

export async function requeueJobAction(formData: FormData): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await requeueReminderJob(gymId, String(formData.get("jobId") ?? ""));
  revalidatePath("/owner/reminders");
}

export async function sendReminderNowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();
  const memberId = String(formData.get("memberId") ?? "");
  try {
    await queueImmediateReminder(gymId, memberId);
    revalidatePath("/owner/reminders");
    revalidatePath(`/owner/members/${memberId}`);
    return ok();
  } catch (error) {
    if (error instanceof ReminderError) return err(error.message);
    return err("Something went wrong. Try again.");
  }
}
