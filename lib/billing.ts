/**
 * Pure date arithmetic for the dues generator. All dates are handled as
 * `YYYY-MM-DD` strings in the gym's civil calendar — no timezone maths, since a
 * billing date is a calendar day, not an instant.
 */

/** `"2026-09-01"` for the month containing `date` (a Date or YYYY-MM-DD string). */
export function periodMonthOf(date: Date | string): string {
  const d = typeof date === "string" ? date : date.toISOString().slice(0, 10);
  return `${d.slice(0, 7)}-01`;
}

/** The period `n` whole months after `periodMonth` (`"2026-09-01"` + 1 → `"2026-10-01"`). */
export function addMonths(periodMonth: string, n: number): string {
  const [y, m] = periodMonth.split("-").map(Number) as [number, number];
  const zero = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(zero / 12);
  const nm = (zero % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-01`;
}

/**
 * The payable date for a period. `anchorDay` is 1–28 (constrained in the
 * schema), so no month-length clamping is needed.
 */
export function dueDateFor(periodMonth: string, anchorDay: number): string {
  return `${periodMonth.slice(0, 7)}-${String(anchorDay).padStart(2, "0")}`;
}

export type RangeKind = "month" | "quarter" | "year";

/**
 * An inclusive `[from, to]` pair of `YYYY-MM-DD` strings for a reporting range
 * ending on `asOf`'s day: the current calendar month, the last 3 months, or the
 * last 12 months.
 */
export function reportRange(kind: RangeKind, asOf: Date | string): {
  from: string;
  to: string;
} {
  const to =
    typeof asOf === "string" ? asOf : asOf.toISOString().slice(0, 10);
  const current = periodMonthOf(to);
  const from =
    kind === "month"
      ? current
      : kind === "quarter"
        ? addMonths(current, -2)
        : addMonths(current, -11);
  return { from, to };
}

/**
 * The billing periods a member should have dues for as of `asOf`: the current
 * month and the next one. A due is only created when its `dueDate` is on or
 * after the member's `joinDate` — that is the "no proration, first full period
 * starts on the next anchor day" rule (open question #4).
 */
export function duePeriodsFor(input: {
  asOf: Date | string;
  joinDate: string;
  anchorDay: number;
}): Array<{ periodMonth: string; dueDate: string }> {
  const current = periodMonthOf(input.asOf);
  return [current, addMonths(current, 1)]
    .map((periodMonth) => ({
      periodMonth,
      dueDate: dueDateFor(periodMonth, input.anchorDay),
    }))
    .filter((p) => p.dueDate >= input.joinDate);
}
