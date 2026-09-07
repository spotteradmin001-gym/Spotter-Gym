"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AuthError, createSession, verifyLogin } from "@/db/queries";
import { err, type ActionState } from "@/lib/result";
import { hitRateLimit, resetRateLimit } from "@/src/features/auth/rate-limit";
import { setSessionCookie } from "@/src/features/auth/session-cookie";

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Shaped for `useActionState`. Never distinguishes "no such account" from
 * "wrong password" — `verifyLogin` raises one generic `AuthError` and this
 * layer just forwards its message.
 */
export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return err("Enter your email and password.");
  }

  const rateKey = `${await clientIp()}|${email}`;
  const limit = hitRateLimit(rateKey);
  if (!limit.ok) {
    const mins = Math.max(1, Math.ceil(limit.retryAfterSec / 60));
    return err(`Too many attempts. Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`);
  }

  let user;
  try {
    user = await verifyLogin({ email, password });
  } catch (error) {
    if (error instanceof AuthError) return err(error.message);
    return err("Something went wrong. Try again.");
  }

  resetRateLimit(rateKey);
  const { sessionId } = await createSession(user.id);
  await setSessionCookie(sessionId);

  redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
}
