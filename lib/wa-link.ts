/**
 * Build a `wa.me` deep link from a phone number and an optional pre-filled
 * message. Opens WhatsApp (app or web) with the recipient selected and the
 * message typed — the human still presses Send from their own WhatsApp. No
 * server, no WAHA session involved.
 *
 * Pure. Reuses `lib/phone.ts` for E.164 normalisation. Returns null for a
 * phone that cannot be normalised, so callers can render nothing.
 */
import { normalizePhone } from "./phone";

export function waLink(
  phone: string | null | undefined,
  message?: string | null,
): string | null {
  if (!phone || !phone.trim()) return null;

  let e164: string;
  try {
    e164 = normalizePhone(phone);
  } catch {
    return null;
  }

  const digits = e164.replace(/^\+/, "");
  const base = `https://wa.me/${digits}`;

  const text = message?.trim();
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
