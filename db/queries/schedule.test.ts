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

dbSuite("holiday CRUD — no cycle lock", () => {
  it("adds a holiday for a past date and closedDates reflects it right away", async () => {
    // No `today` guard any more: a date well inside a past cycle is allowed.
    const h = await addHoliday({
      gymId,
      date: "2026-01-15",
      label: "Retroactive rest day",
    });
    expect(h.date).toBe("2026-01-15");

    const set = await closedDates(gymId, "2026-01-01", "2026-01-31");
    expect(set.has("2026-01-15")).toBe(true);

    // removable regardless of how old it is
    await removeHoliday({ gymId, id: h.id });
    expect((await getGymSchedule(gymId)).holidays.some((x) => x.id === h.id)).toBe(
      false,
    );
    expect(
      (await closedDates(gymId, "2026-01-01", "2026-01-31")).has("2026-01-15"),
    ).toBe(false);
  });

  it("adds a future holiday, rejects a duplicate, then lists it", async () => {
    const h = await addHoliday({
      gymId,
      date: "2026-10-05",
      label: "Founders Day",
    });
    expect(h.date).toBe("2026-10-05");

    await expect(
      addHoliday({ gymId, date: "2026-10-05", label: "again" }),
    ).rejects.toThrow(/already on the holiday list/);

    const list = (await getGymSchedule(gymId)).holidays;
    expect(list.map((x) => x.date)).toContain("2026-10-05");
  });

  it("rejects a malformed date and a too-short label", async () => {
    await expect(
      addHoliday({ gymId, date: "not-a-date", label: "x" }),
    ).rejects.toBeInstanceOf(ScheduleError);
    await expect(
      addHoliday({ gymId, date: "2026-12-25", label: "x" }),
    ).rejects.toThrow(/label/i);
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
