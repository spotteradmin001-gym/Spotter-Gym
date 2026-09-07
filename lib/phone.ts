/**
 * Phone normalisation for WhatsApp. Gym members are entered by staff typing a
 * local number; we store it E.164 (`+<country><subscriber>`) and derive the
 * WAHA `chatId` from that.
 *
 * Default country is India (91) — override per call if Spotter ever onboards a
 * gym elsewhere.
 */

const DEFAULT_COUNTRY = "91";

export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneError";
  }
}

/**
 * Returns the number as `+<digits>` (E.164). Accepts a leading `+`, `00`, or a
 * bare local number (to which the default country code is prepended). Throws
 * `PhoneError` if the result isn't 8–15 digits.
 */
export function normalizePhone(raw: string, country = DEFAULT_COUNTRY): string {
  let s = raw.trim().replace(/[\s()\-.]/g, "");

  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (!s.startsWith(country)) s = country + s.replace(/^0+/, "");

  if (!/^\d{8,15}$/.test(s)) {
    throw new PhoneError("Enter a valid phone number.");
  }
  return `+${s}`;
}

/** `+9198…` → `9198…@c.us`, the id WAHA's /api/sendText expects. */
export function toWhatsAppChatId(e164: string): string {
  return `${e164.replace(/^\+/, "")}@c.us`;
}
