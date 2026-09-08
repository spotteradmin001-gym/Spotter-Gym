/**
 * Rest-day-aware check-in streak. Pure — the caller supplies the member's
 * check-in dates, the gym's closed dates and today, all as `YYYY-MM-DD`
 * strings.
 *
 * Rules (CR-9 / 9c):
 * - A closed day (a weekly closed weekday or a one-off holiday) neither
 *   requires a check-in nor breaks the streak — it is skipped.
 * - Only a missed *open* day counts against the member.
 * - `allowedMisses` is the per billing-cycle buffer: that many missed open
 *   days are forgiven; the (allowedMisses + 1)th missed open day breaks the
 *   streak.
 * - Today itself, when it is an open day with no check-in yet, is treated as
 *   "in progress" — it is not counted as a miss (this mirrors the old
 *   yesterday-grace behaviour so the streak does not drop the instant
 *   midnight passes).
 *
 * The return value is the number of check-ins in the current unbroken run.
 */
export function currentStreak(input: {
  checkins: Iterable<string>;
  closed?: Iterable<string>;
  today: string;
  allowedMisses?: number;
}): number {
  const have = new Set(input.checkins);
  if (have.size === 0) return 0;

  const closed = new Set(input.closed ?? []);
  const buffer = Math.max(0, Math.trunc(input.allowedMisses ?? 0));

  // No run can extend past the earliest check-in — everything before it is
  // either a rest day or a miss, neither of which raises the count.
  let earliest = input.today;
  for (const d of have) if (d < earliest) earliest = d;

  let streak = 0;
  let misses = 0;
  for (let day = input.today; day >= earliest; day = addDays(day, -1)) {
    if (have.has(day)) {
      streak++;
      continue;
    }
    if (closed.has(day)) continue; // rest day — skip, no penalty
    if (day === input.today) continue; // open day still in progress
    misses++;
    if (misses > buffer) break;
  }
  return streak;
}

/** `addDays("2026-09-08", -1)` → `"2026-09-07"`. Calendar-day math in UTC. */
export function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
