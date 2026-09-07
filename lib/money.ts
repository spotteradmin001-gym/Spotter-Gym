/**
 * INR money helpers. Amounts are stored as integer paise (₹1 = 100 paise)
 * everywhere in the database; these convert to and from the rupee values shown
 * in the UI.
 */

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** "₹1,500.00" — for display. */
export function formatPaise(paise: number | null | undefined): string {
  if (paise == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(paise / 100);
}
