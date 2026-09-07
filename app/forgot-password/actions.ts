"use server";

import { createPasswordResetToken } from "@/db/queries";
import { appUrl } from "@/lib/app-url";
import { MailSendError, sendMail } from "@/lib/mail";
import { err, ok, type ActionState } from "@/lib/result";

/**
 * Public, unauthenticated. Always returns the same success — the form shows a
 * generic "check your email" panel — so a stranger can't tell which addresses
 * have an account. Only actually emails when the address matches an active
 * account.
 */
export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return err("Enter your email address.");
  }

  const issued = await createPasswordResetToken(email);
  if (issued) {
    const link = `${appUrl()}/reset-password/${issued.token}`;
    try {
      await sendMail({
        to: issued.email,
        subject: "Reset your Spotter password",
        text:
          "We received a request to reset your Spotter password.\n\n" +
          `Open this link to choose a new one (it expires in 1 hour):\n${link}\n\n` +
          "If you didn't ask for this, you can ignore this email.",
      });
    } catch (error) {
      if (error instanceof MailSendError) {
        return err("Couldn't send the email just now. Try again in a moment.");
      }
      throw error;
    }
  }

  return ok();
}
