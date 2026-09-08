/**
 * Pure scoring for the attendance reward (CR-9 / 9d). No DB, no dates beyond
 * `YYYY-MM-DD` / `YYYY-MM-01` strings.
 *
 * Rules locked in changes.md:
 * - Period = the member's anchor-day billing cycle.
 * - Qualifying = a check-in on every OPEN day of that cycle, forgiving up to
 *   `allowedMisses` missed open days (all-or-nothing beyond the buffer).
 * - Redemption = cycle N+2: a clean cycle N discounts the due for cycle N+2.
 */
import { addMonths, billingCycleWindow, periodMonthOf } from "./billing";
import { addDays } from "./streak";

export type RewardQualification = {
  /** Period-month (`YYYY-MM-01`) of the scored cycle. */
  earnedPeriod: string;
  /** Period-month the credit redeems against — `earnedPeriod` + 2 months. */
  redeemPeriod: string;
  /** Anchor date the cycle starts on (inclusive). */
  cycleStart: string;
  /** Anchor date the next cycle starts on (exclusive). */
  cycleEnd: string;
  openDays: number;
  missedOpen: number;
  qualifies: boolean;
};

/**
 * The most-recently-closed billing cycle as of `today` for a member billing on
 * `anchorDay`, and whether their check-ins clear it. The caller supplies the
 * member's check-in dates and the gym's closed dates (both `YYYY-MM-DD`).
 */
export function qualifyStreakReward(input: {
  anchorDay: number;
  today: string;
  checkins: Iterable<string>;
  closed: Iterable<string>;
  allowedMisses?: number;
}): RewardQualification {
  const window = closedCycleWindow(input.anchorDay, input.today);
  const checkins = new Set(input.checkins);
  const closed = new Set(input.closed);
  const buffer = Math.max(0, Math.trunc(input.allowedMisses ?? 0));

  let openDays = 0;
  let missedOpen = 0;
  for (let d = window.cycleStart; d < window.cycleEnd; d = addDays(d, 1)) {
    if (closed.has(d)) continue;
    openDays++;
    if (!checkins.has(d)) missedOpen++;
  }

  return {
    ...window,
    openDays,
    missedOpen,
    // A cycle with no open days at all (misconfigured schedule) never pays out.
    qualifies: openDays > 0 && missedOpen <= buffer,
  };
}

/**
 * Cycle boundaries + period-month labels for the cycle that closed most
 * recently on or before `today`. Robust to a cron that missed a day: any day
 * inside cycle N+1 resolves to cycle N here.
 */
export function closedCycleWindow(
  anchorDay: number,
  today: string,
): {
  earnedPeriod: string;
  redeemPeriod: string;
  cycleStart: string;
  cycleEnd: string;
} {
  const currentStart = billingCycleWindow(anchorDay, today).start;
  const prev = billingCycleWindow(anchorDay, addDays(currentStart, -1));
  const earnedPeriod = periodMonthOf(prev.start);
  return {
    earnedPeriod,
    redeemPeriod: addMonths(earnedPeriod, 2),
    cycleStart: prev.start,
    cycleEnd: prev.end,
  };
}

/**
 * A `percent` reward off `amountDuePaise`. `percent` is clamped to 0–100;
 * `percent = 0` is a no-op. Discount is rounded to the nearest paise.
 */
export function applyRewardDiscount(
  amountDuePaise: number,
  percent: number,
): { discountPaise: number; netPaise: number } {
  const p = Math.min(100, Math.max(0, Math.trunc(percent)));
  const discountPaise = Math.round((amountDuePaise * p) / 100);
  return {
    discountPaise,
    netPaise: Math.max(0, amountDuePaise - discountPaise),
  };
}
