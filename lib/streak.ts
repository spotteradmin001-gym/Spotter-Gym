/**
 * Check-in streak: consecutive calendar days with a check-in, ending today or
 * yesterday (so the streak doesn't drop to 0 the instant midnight passes before
 * today's visit). One fully missed day breaks it. Pure.
 *
 * `dates` is a set of `YYYY-MM-DD` strings (order doesn't matter).
 */
export function currentStreak(dates: Iterable<string>, today: string): number {
  const have = new Set(dates);
  if (have.size === 0) return 0;

  const start = have.has(today)
    ? today
    : have.has(addDays(today, -1))
      ? addDays(today, -1)
      : null;
  if (start === null) return 0;

  let streak = 0;
  let day = start;
  while (have.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/** `addDays("2026-09-08", -1)` → `"2026-09-07"`. Calendar-day math in UTC. */
export function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
