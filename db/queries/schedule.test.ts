/**
 * Integration test for db/queries/schedule.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name `test_sched %`.
 */
import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms } from "@/db/schema";

import { createGym } from "./gyms";
import {
  ScheduleError,
  addHoliday,
  closedDates,
  getGymSchedule,
  removeHoliday,
  scheduleLockBoundary,
  setClosedWeekdays,
} from "./schedule";

let gymId = "";

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    // Default billing_anchor_day is 1, so the gym-level cycle is calendar-month.
    gymId = (await createGym({ name: "test_sched Main" })).id;
  });
  afterAll(async () => {
    await db.delete(gyms).where(like(gyms.name, "test_sched %"));
    await closeDb();
  });
}

dbSuite("weekly closed days", () => {
  it("defaults to Sunday only, then replaces the set", async () => {
    const before = await getGymSchedule(gymId);
    expect(before.closedWeekdays).toEqual([0]);
    expect(before.holidays).toEqual([]);

    await setClosedWeekdays(gymId, [6, 0, 0]); // dedupes + sorts
    expect((await getGymSchedule(gymId)).closedWeekdays).toEqual([0, 6]);
  });

  it("rejects an out-of-range weekday and a fully-closed week", async () => {
    await expect(setClosedWeekdays(gymId, [7])).rejects.toBeInstanceOf(ScheduleError);
    await expect(
      setClosedWeekdays(gymId, [0, 1, 2, 3, 4, 5, 6]),
    ).rejects.toThrow(/at least one day/);
  });
});

dbSuite("holiday CRUD + per-cycle lock", () => {
  it("computes the lock boundary as the next cycle start", async () => {
    // anchor day 1, today 15 Sep → current cycle is Sep, next starts 1 Oct
    expect(await scheduleLockBoundary(gymId, "2026-09-15")).toBe("2026-10-01");
  });

  it("rejects a holiday inside the current or a past cycle", async () => {
    await expect(
      addHoliday({ gymId, date: "2026-09-20", label: "Mid-cycle", today: "2026-09-15" }),
    ).rejects.toThrow(/locked/i);
  });

  it("adds a future holiday, rejects a duplicate, then lists it", async () => {
    const h = await addHoliday({
      gymId,
      date: "2026-10-05",
      label: "Founders Day",
      today: "2026-09-15",
    });
    expect(h.date).toBe("2026-10-05");

    await expect(
      addHoliday({ gymId, date: "2026-10-05", label: "again", today: "2026-09-15" }),
    ).rejects.toThrow(/already on the holiday list/);

    const list = (await getGymSchedule(gymId)).holidays;
    expect(list.map((x) => x.date)).toContain("2026-10-05");
  });

  it("removes a future holiday but refuses one that has slipped into a locked cycle", async () => {
    const h = await addHoliday({
      gymId,
      date: "2026-11-10",
      label: "Temp",
      today: "2026-10-15",
    });

    // now "today" is past that date's cycle → locked
    await expect(
      removeHoliday({ gymId, id: h.id, today: "2026-12-20" }),
    ).rejects.toThrow(/locked/i);

    // still in the future relative to this "today" → removable
    await removeHoliday({ gymId, id: h.id, today: "2026-10-15" });
    expect((await getGymSchedule(gymId)).holidays.some((x) => x.id === h.id)).toBe(false);
  });
});

dbSuite("closedDates", () => {
  it("merges weekly closed weekdays with in-range holidays", async () => {
    await setClosedWeekdays(gymId, [0]); // Sundays only
    // ensure a known holiday exists in range
    await addHoliday({
      gymId,
      date: "2026-10-05",
      label: "Founders Day",
      today: "2026-09-15",
    }).catch(() => undefined); // may already exist from an earlier test

    const set = await closedDates(gymId, "2026-10-01", "2026-10-10");
    expect(set.has("2026-10-04")).toBe(true); // Sunday
    expect(set.has("2026-10-05")).toBe(true); // holiday (a Monday)
    expect(set.has("2026-10-06")).toBe(false); // open Tuesday
    // a holiday outside the range is not included
    expect(set.has("2026-11-10")).toBe(false);
  });

  it("returns an empty set for an inverted or malformed range", async () => {
    expect((await closedDates(gymId, "2026-10-10", "2026-10-01")).size).toBe(0);
    expect((await closedDates(gymId, "nope", "2026-10-01")).size).toBe(0);
  });
});
