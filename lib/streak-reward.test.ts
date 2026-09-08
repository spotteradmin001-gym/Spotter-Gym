import { describe, expect, it } from "vitest";

import {
  applyRewardDiscount,
  closedCycleWindow,
  qualifyStreakReward,
} from "./streak-reward";
import { addDays } from "./streak";

function sundaysBetween(from: string, toExclusive: string): string[] {
  const out: string[] = [];
  for (let d = from; d < toExclusive; d = addDays(d, 1)) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) out.push(d);
  }
  return out;
}

function daysBetween(from: string, toExclusive: string): string[] {
  const out: string[] = [];
  for (let d = from; d < toExclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

describe("closedCycleWindow", () => {
  it("resolves to the cycle that closed most recently (anchor day 1)", () => {
    const w = closedCycleWindow(1, "2026-09-15");
    expect(w.cycleStart).toBe("2026-08-01");
    expect(w.cycleEnd).toBe("2026-09-01");
    expect(w.earnedPeriod).toBe("2026-08-01");
    expect(w.redeemPeriod).toBe("2026-10-01"); // N+2
  });

  it("handles a mid-month anchor day crossing calendar months", () => {
    const w = closedCycleWindow(12, "2026-09-05");
    // current cycle started 2026-08-12, so the closed one is 2026-07-12..2026-08-12
    expect(w.cycleStart).toBe("2026-07-12");
    expect(w.cycleEnd).toBe("2026-08-12");
    expect(w.earnedPeriod).toBe("2026-07-01");
    expect(w.redeemPeriod).toBe("2026-09-01");
  });

  it("is stable across every day of the following cycle (cron can miss days)", () => {
    const first = closedCycleWindow(1, "2026-09-01");
    for (const day of daysBetween("2026-09-01", "2026-10-01")) {
      expect(closedCycleWindow(1, day)).toEqual(first);
    }
  });
});

describe("qualifyStreakReward", () => {
  const anchorDay = 1;
  const today = "2026-09-15";
  const CYCLE_START = "2026-08-01";
  const CYCLE_END = "2026-09-01";
  const closed = sundaysBetween(CYCLE_START, CYCLE_END);
  const openDays = daysBetween(CYCLE_START, CYCLE_END).filter(
    (d) => !closed.includes(d),
  );

  it("earns on a clean cycle and ignores closed days entirely", () => {
    const q = qualifyStreakReward({ anchorDay, today, checkins: openDays, closed });
    expect(q.openDays).toBe(openDays.length);
    expect(q.missedOpen).toBe(0);
    expect(q.qualifies).toBe(true);
    expect(q.earnedPeriod).toBe("2026-08-01");
    expect(q.redeemPeriod).toBe("2026-10-01");
  });

  it("is all-or-nothing: one missed open day with no buffer breaks it", () => {
    const q = qualifyStreakReward({
      anchorDay,
      today,
      checkins: openDays.slice(1), // drop the first open day
      closed,
    });
    expect(q.missedOpen).toBe(1);
    expect(q.qualifies).toBe(false);
  });

  it("forgives misses up to the buffer, breaking on the (buffer+1)th", () => {
    const missTwo = openDays.slice(2);
    expect(
      qualifyStreakReward({ anchorDay, today, checkins: missTwo, closed, allowedMisses: 2 })
        .qualifies,
    ).toBe(true);
    expect(
      qualifyStreakReward({ anchorDay, today, checkins: missTwo, closed, allowedMisses: 1 })
        .qualifies,
    ).toBe(false);
  });

  it("does not penalise skipping a closed day", () => {
    // checked in on every open day but never on a Sunday → still clean
    const q = qualifyStreakReward({ anchorDay, today, checkins: openDays, closed });
    expect(q.qualifies).toBe(true);
  });

  it("never pays out a cycle with zero open days", () => {
    const allClosed = daysBetween(CYCLE_START, CYCLE_END);
    const q = qualifyStreakReward({ anchorDay, today, checkins: [], closed: allClosed });
    expect(q.openDays).toBe(0);
    expect(q.qualifies).toBe(false);
  });
});

describe("applyRewardDiscount", () => {
  it("takes the percent off, rounded to the nearest paise", () => {
    expect(applyRewardDiscount(100_000, 10)).toEqual({
      discountPaise: 10_000,
      netPaise: 90_000,
    });
    expect(applyRewardDiscount(99_999, 10)).toEqual({
      discountPaise: 10_000,
      netPaise: 89_999,
    });
  });

  it("percent 0 is a no-op (feature inert)", () => {
    expect(applyRewardDiscount(100_000, 0)).toEqual({
      discountPaise: 0,
      netPaise: 100_000,
    });
  });

  it("clamps out-of-range percents", () => {
    expect(applyRewardDiscount(100_000, 150).netPaise).toBe(0);
    expect(applyRewardDiscount(100_000, -5)).toEqual({
      discountPaise: 0,
      netPaise: 100_000,
    });
  });
});
