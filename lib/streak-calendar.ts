/**
 * Month-grid model for the member streak calendar (CR-9 / 9b). Pure — the
 * caller supplies the month, today, the member's check-in dates and the gym's
 * closed dates (all `YYYY-MM-DD`).
 *
 * Each cell is one of:
 * - `checked_in` — the member has a check-in that day
 * - `rest_day`   — the gym is closed (weekly closed weekday or a holiday) and
 *                  there is no check-in
 * - `upcoming`   — the day is today or later and not yet checked in
 * - `missed_open` — a past open day with no check-in
 */
import { addDays } from "./streak";

export type DayState = "checked_in" | "missed_open" | "rest_day" | "upcoming";

export type CalendarDay = {
  /** `YYYY-MM-DD`. */
  date: string;
  dayOfMonth: number;
  /** JS weekday, 0 = Sunday. */
  weekday: number;
  /** False for the leading / trailing days that pad the grid to full weeks. */
  inMonth: boolean;
  state: DayState;
};

export type MonthGrid = {
  /** `YYYY-MM`. */
  month: string;
  /** e.g. `"September 2026"`. */
  label: string;
  /** Weekday headers in column order, 0 = Sunday. */
  weekdayOrder: number[];
  /** Rows of exactly 7 days, Sunday-first by default. */
  weeks: CalendarDay[][];
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ISO_MONTH_RE = /^\d{4}-\d{2}$/;

function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function classify(
  date: string,
  today: string,
  checkedIn: Set<string>,
  closed: Set<string>,
): DayState {
  if (checkedIn.has(date)) return "checked_in";
  if (closed.has(date)) return "rest_day";
  if (date >= today) return "upcoming";
  return "missed_open";
}

/**
 * Build the grid for `input.month`. `weekStartsOn` is a JS weekday (default 0 =
 * Sunday, which suits the Sunday-default rest day). Returns 4–6 week rows, each
 * padded to 7 days with `inMonth: false` cells from the adjacent months.
 */
export function buildMonthGrid(input: {
  month: string;
  today: string;
  checkins: Iterable<string>;
  closed: Iterable<string>;
  weekStartsOn?: number;
}): MonthGrid {
  const month = ISO_MONTH_RE.test(input.month)
    ? input.month
    : input.today.slice(0, 7);
  const weekStartsOn = ((input.weekStartsOn ?? 0) % 7 + 7) % 7;
  const checkedIn = new Set(input.checkins);
  const closed = new Set(input.closed);

  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${month}-${String(daysInMonth).padStart(2, "0")}`;

  // Pad back to the start-of-week on or before the 1st.
  let gridStart = first;
  while (weekdayOf(gridStart) !== weekStartsOn) gridStart = addDays(gridStart, -1);
  // Pad forward to the end-of-week on or after the last day.
  const endWeekday = (weekStartsOn + 6) % 7;
  let gridEnd = last;
  while (weekdayOf(gridEnd) !== endWeekday) gridEnd = addDays(gridEnd, 1);

  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);

  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) {
    week.push({
      date: day,
      dayOfMonth: Number(day.slice(8, 10)),
      weekday: weekdayOf(day),
      inMonth: day >= first && day <= last,
      state: classify(day, input.today, checkedIn, closed),
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  return {
    month,
    label: `${MONTHS[m - 1]} ${y}`,
    weekdayOrder,
    weeks,
  };
}
