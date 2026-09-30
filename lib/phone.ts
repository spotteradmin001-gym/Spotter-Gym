/**
 * Phone normalisation for WhatsApp. Gym members are entered by staff typing a
 * local number; we store it E.164 (`+<country><subscriber>`) and derive the
 * WAHA `chatId` from that.
 *
 * Default country is India (91) — pass another code per call if needed.
 */

const DEFAULT_COUNTRY = "91";
/** Subscriber digits in a local number (India, US: 10). */
const LOCAL_LENGTH = 10;

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
  else {
    s = s.replace(/^0+/, "");
    // A 10-digit number is always local, even when it happens to start with
    // the country code's digits (Indian mobiles like 91234 56789). Only a
    // number already *longer* than a local one is taken to include the code.
    const hasCode = s.startsWith(country) && s.length === country.length + LOCAL_LENGTH;
    if (!hasCode) s = country + s;
  }

  if (!/^\d{8,15}$/.test(s)) {
    throw new PhoneError("Enter a valid phone number.");
  }
  return `+${s}`;
}

/** `+9198…` → `9198…@c.us`, the id WAHA's /api/sendText expects. */
export function toWhatsAppChatId(e164: string): string {
  return `${e164.replace(/^\+/, "")}@c.us`;
}
