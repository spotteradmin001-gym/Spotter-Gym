import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP sender. Configured with the standard `MAIL_*` env vars — works with
 * Gmail (`smtp.gmail.com:465`, an App Password as `MAIL_PASSWORD`) or any other
 * provider.
 *
 * When `MAIL_HOST` is unset the mailer is "not configured": `sendMail` logs the
 * message to the server console instead of sending, so local development and
 * preview deploys work without credentials. `isMailerConfigured()` lets a
 * caller surface a "not set up yet" state rather than silently no-op.
 */

export type MailInput = {
  to: string;
  subject: string;
  text: string;
};

export class MailSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailSendError";
  }
}

export function isMailerConfigured(): boolean {
  return Boolean(process.env.MAIL_HOST?.trim());
}

function fromAddress(): string {
  return (
    process.env.MAIL_FROM?.trim() ||
    process.env.MAIL_USER?.trim() ||
    "Spotter <no-reply@spotter.app>"
  );
}

let cached: Transporter | undefined;

function transport(): Transporter {
  if (!cached) {
    const port = Number(process.env.MAIL_PORT ?? 465);
    cached = nodemailer.createTransport({
      host: process.env.MAIL_HOST!.trim(),
      port,
      secure: port === 465,
      auth: {
        user: process.env.MAIL_USER?.trim(),
        pass: process.env.MAIL_PASSWORD?.trim(),
      },
    });
  }
  return cached;
}

export async function sendMail(input: MailInput): Promise<void> {
  if (!isMailerConfigured()) {
    console.info(
      `[mail] not configured — would send to ${input.to}\n` +
        `Subject: ${input.subject}\n\n${input.text}`,
    );
    return;
  }
  try {
    await transport().sendMail({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
  } catch (error) {
    throw new MailSendError(
      error instanceof Error ? error.message : "Could not send the email.",
    );
  }
}
