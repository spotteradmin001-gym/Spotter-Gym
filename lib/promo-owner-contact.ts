/**
 * Pure helpers for the admin promotion "Send quote / bill via WhatsApp" owner
 * picker (post-review revision R.3). A gym can have more than one owner account;
 * the admin chooses which owner's phone the `wa.me` link targets.
 *
 * No DB, no React, no `server-only` — safe to import from the client picker.
 */

export type OwnerContact = {
  /** The owner account id. */
  id: string;
  /** Dropdown label: account email + masked phone. */
  label: string;
  /** The owner's phone, exactly as stored (E.164). */
  phone: string;
};

/**
 * Mask a phone for display: keep the first two and last two digits, replace the
 * rest with bullets. `+919812345678` → `+91 •••••••• 78`. A value with fewer
 * than five digits is returned unchanged (nothing meaningful to hide).
 */
export function maskPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 5) return trimmed;

  const head = digits.slice(0, 2);
  const tail = digits.slice(-2);
  const bullets = "•".repeat(digits.length - 4);
  return `${trimmed.startsWith("+") ? "+" : ""}${head} ${bullets} ${tail}`;
}

/**
 * The gym owners that can receive a quote/bill link — those with a phone on
 * file — each with a display label. Input order is preserved so the first
 * owner (by the caller's ordering) is the default selection.
 */
export function ownerContactChoices(
  owners: ReadonlyArray<{ id: string; email: string; phone: string | null }>,
): OwnerContact[] {
  const out: OwnerContact[] = [];
  for (const o of owners) {
    const phone = o.phone?.trim();
    if (!phone) continue;
    out.push({ id: o.id, phone, label: `${o.email} · ${maskPhone(phone)}` });
  }
  return out;
}

/**
 * The phone for the chosen owner id. Falls back to the first choice when the id
 * is missing or unknown (e.g. the selected owner lost their phone between page
 * load and interaction). `null` only when there are no choices at all.
 */
export function selectedOwnerPhone(
  choices: ReadonlyArray<OwnerContact>,
  selectedId: string | null | undefined,
): string | null {
  if (choices.length === 0) return null;
  const match = choices.find((c) => c.id === selectedId);
  return (match ?? choices[0]!).phone;
}
