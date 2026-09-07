"use server";

import { redirect } from "next/navigation";

import { AuthError, resetPasswordWithToken } from "@/db/queries";
import { err, type ActionState } from "@/lib/result";

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) return err("This reset link is invalid or has expired.");
  if (!newPassword) return err("Enter a new password.");
  if (newPassword !== confirmPassword) {
    return err("Passwords don't match.", { confirmPassword: "Doesn't match" });
  }

  try {
    await resetPasswordWithToken(token, newPassword);
  } catch (error) {
    if (error instanceof AuthError) return err(error.message);
    return err("Something went wrong. Try again.");
  }

  redirect("/login?changed=1");
}
