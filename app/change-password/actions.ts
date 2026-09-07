"use server";

import { redirect } from "next/navigation";

import { AuthError, changeOwnPassword, getSessionUser } from "@/db/queries";
import { err, type ActionState } from "@/lib/result";
import {
  clearSessionCookie,
  readSessionCookie,
} from "@/src/features/auth/session-cookie";

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getSessionUser(await readSessionCookie());
  if (!user) redirect("/login");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword) {
    return err("Fill in every field.");
  }
  if (newPassword !== confirmPassword) {
    return err("New passwords don't match.", { confirmPassword: "Doesn't match" });
  }

  try {
    await changeOwnPassword({ userId: user.id, currentPassword, newPassword });
  } catch (error) {
    if (error instanceof AuthError) return err(error.message);
    return err("Something went wrong. Try again.");
  }

  // changeOwnPassword revoked every session, including this request's own —
  // the cookie now points at a deleted row. Clear it and start a fresh login.
  await clearSessionCookie();
  redirect("/login?changed=1");
}
