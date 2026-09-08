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

/** `"2026-09-08"` → `0` (Sunday) … `6` (Saturday). Calendar-day math in UTC. */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/**
 * The anchor-day billing cycle that contains `ref`, as a half-open
 * `[start, end)` pair of `YYYY-MM-DD` strings: `start` is the most recent
 * occurrence of day-of-month `anchorDay` on or before `ref`, `end` is the next
 * occurrence (the first day of the following cycle). `anchorDay` is 1–28
 * (schema-constrained) so no month-length clamping is needed.
 *
 * This is the gym-level, member-agnostic cycle used for the Phase E schedule
 * lock and for scoring a member's streak reward per their own billing cycle
 * (CR-9 decision 8 — anchor-day billing, 28–31 day windows).
 */
export function billingCycleWindow(
  anchorDay: number,
  ref: Date | string,
): { start: string; end: string } {
  const r = typeof ref === "string" ? ref : ref.toISOString().slice(0, 10);
  const [y, m, d] = r.split("-").map(Number) as [number, number, number];

  let sy = y;
  let sm = m; // 1-based month of the cycle start
  if (d < anchorDay) {
    sm -= 1;
    if (sm === 0) {
      sm = 12;
      sy -= 1;
    }
  }

  let ey = sy;
  let em = sm + 1;
  if (em === 13) {
    em = 1;
    ey += 1;
  }

  const day = String(anchorDay).padStart(2, "0");
  return {
    start: `${String(sy).padStart(4, "0")}-${String(sm).padStart(2, "0")}-${day}`,
    end: `${String(ey).padStart(4, "0")}-${String(em).padStart(2, "0")}-${day}`,
  };
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
