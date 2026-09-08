/**
 * Pre-filled WhatsApp message bodies for the "Share via WhatsApp" buttons
 * (CR-7). Pure string builders — the caller passes every value, including any
 * URL, so these stay testable and usable on the client.
 *
 * Link-first: where a flow has an activation or reset link, the message leads
 * with the link and only includes a raw temporary password when there is no
 * link (owner / employee first sign-in). A one-time, must-change credential
 * over WhatsApp is the same exposure as reading it out on a call.
 */

export type StaffWelcomeInput = {
  /** Recipient's name, when known — the greeting adapts if absent. */
  name?: string | null;
  gymName: string;
  loginUrl: string;
  email: string;
  /** The one-time password shown at creation. */
  tempPassword: string;
};

export type MemberActivationInput = {
  name?: string | null;
  gymName: string;
  activationLink: string;
};

export type PasswordResetInput = {
  name?: string | null;
  gymName: string;
  email: string;
  /** A reset link if the flow produced one — preferred over the password. */
  resetLink?: string | null;
  /** A fresh temporary password, when the reset just regenerates one. */
  tempPassword?: string | null;
};

import { formatPaise } from "./money";

function greeting(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? `Hi ${trimmed},` : "Hi,";
}

export function ownerWelcomeMessage(input: StaffWelcomeInput): string {
  return [
    greeting(input.name),
    "",
    `You have an owner login for ${input.gymName} on Spotter.`,
    "",
    `Sign in: ${input.loginUrl}`,
    `Email: ${input.email}`,
    `Temporary password: ${input.tempPassword}`,
    "",
    "You'll be asked to set your own password on first sign-in.",
  ].join("\n");
}

export function employeeWelcomeMessage(input: StaffWelcomeInput): string {
  return [
    greeting(input.name),
    "",
    `You have a staff login for ${input.gymName} on Spotter.`,
    "",
    `Sign in: ${input.loginUrl}`,
    `Email: ${input.email}`,
    `Temporary password: ${input.tempPassword}`,
    "",
    "You'll be asked to set your own password on first sign-in.",
  ].join("\n");
}

export function memberActivationMessage(input: MemberActivationInput): string {
  return [
    greeting(input.name),
    "",
    `Activate your ${input.gymName} member account on Spotter to see your dues, payments and check-in streak.`,
    "",
    `Activate here (valid 7 days): ${input.activationLink}`,
  ].join("\n");
}

export function passwordResetMessage(input: PasswordResetInput): string {
  const lines = [
    greeting(input.name),
    "",
    `Your ${input.gymName} Spotter password has been reset.`,
    "",
    `Email: ${input.email}`,
  ];

  if (input.resetLink?.trim()) {
    lines.push(`Set a new password: ${input.resetLink}`);
  } else if (input.tempPassword?.trim()) {
    lines.push(
      `Temporary password: ${input.tempPassword}`,
      "",
      "You'll be asked to set your own password on first sign-in.",
    );
  }

  return lines.join("\n");
}

export type PromotionQuoteInput = {
  gymName: string;
  recipientCount: number;
  /** Billable parts per recipient (1 for text-only or image-only, 2 for both). */
  partsPerRecipient: number;
  perMessagePaise: number;
  estimatedTotalPaise: number;
};

/** The "Send quote via WhatsApp" message — CR-10 step 6. */
export function promotionQuoteMessage(input: PromotionQuoteInput): string {
  return [
    `Spotter promotion quote for ${input.gymName}:`,
    "",
    `Recipients: ${input.recipientCount}`,
    `Messages per recipient: ${input.partsPerRecipient}`,
    `Charge per message: ${formatPaise(input.perMessagePaise)}`,
    `Estimated total: ${formatPaise(input.estimatedTotalPaise)}`,
    "",
    "Approve the estimate in your Promotions tab, then prepay this amount (UPI / bank / cash). Sending starts once we confirm the payment. Any messages that don't deliver are refunded.",
  ].join("\n");
}

export type PromotionBillInput = {
  gymName: string;
  /** Parts actually delivered (status 'sent'). */
  deliveredParts: number;
  perMessagePaise: number;
  billedTotalPaise: number;
  prepaidPaise: number;
  refundPaise: number;
};

/** The "Send bill via WhatsApp" message — CR-10 step 10. */
export function promotionBillMessage(input: PromotionBillInput): string {
  const lines = [
    `Spotter promotion bill for ${input.gymName}:`,
    "",
    `Delivered messages: ${input.deliveredParts}`,
    `Charge per message: ${formatPaise(input.perMessagePaise)}`,
    `Final bill: ${formatPaise(input.billedTotalPaise)}`,
    `Prepaid: ${formatPaise(input.prepaidPaise)}`,
  ];
  if (input.refundPaise > 0) {
    lines.push(
      `Refund due to you: ${formatPaise(input.refundPaise)}`,
      "",
      "We'll refund this to you offline.",
    );
  } else {
    lines.push("", "Fully settled — thank you.");
  }
  return lines.join("\n");
}
