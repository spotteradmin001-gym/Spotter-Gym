"use server";

import { redirect } from "next/navigation";

import { activateMember, AuthError } from "@/db/queries";
import { err, type ActionState } from "@/lib/result";
import { setSessionCookie } from "@/src/features/auth/session-cookie";

export async function activateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!token) return err("This activation link is invalid or has expired.");
  if (password !== confirm) {
    return err("Passwords don't match.", { confirmPassword: "Doesn't match" });
  }

  let sessionId: string;
  try {
    const result = await activateMember(token, { email, password });
    sessionId = result.sessionId;
  } catch (error) {
    if (error instanceof AuthError) return err(error.message);
    return err("Something went wrong. Try again.");
  }

  await setSessionCookie(sessionId);
  redirect("/m/profile");
}
