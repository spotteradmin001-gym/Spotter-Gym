import { describe, expect, it } from "vitest";

import { buildMonthGrid } from "./streak-calendar";

describe("buildMonthGrid", () => {
  const base = {
    month: "2026-09",
    today: "2026-09-10",
    checkins: [] as string[],
    closed: [] as string[],
  };

  it("labels the month and pads to whole Sunday-first weeks", () => {
    const grid = buildMonthGrid(base);
    expect(grid.label).toBe("September 2026");
    expect(grid.weekdayOrder).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    expect(grid.weeks[0]![0]!.weekday).toBe(0); // first column is Sunday
    expect(grid.weeks.at(-1)!.at(-1)!.weekday).toBe(6); // last column is Saturday
  });

  it("covers every day of the month exactly once, flagged inMonth", () => {
    const grid = buildMonthGrid(base);
    const inMonth = grid.weeks.flat().filter((d) => d.inMonth).map((d) => d.date);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0]).toBe("2026-09-01");
    expect(inMonth.at(-1)).toBe("2026-09-30");
  });

  it("classifies each day", () => {
    const grid = buildMonthGrid({
      month: "2026-09",
      today: "2026-09-10",
      checkins: ["2026-09-07", "2026-09-08"],
      closed: ["2026-09-06", "2026-09-13"], // Sundays
    });
    const byDate = new Map(grid.weeks.flat().map((d) => [d.date, d.state]));
    expect(byDate.get("2026-09-07")).toBe("checked_in");
    expect(byDate.get("2026-09-08")).toBe("checked_in");
    expect(byDate.get("2026-09-06")).toBe("rest_day"); // closed, no check-in
    expect(byDate.get("2026-09-09")).toBe("missed_open"); // past open, no check-in
    expect(byDate.get("2026-09-10")).toBe("upcoming"); // today, not yet checked in
    expect(byDate.get("2026-09-20")).toBe("upcoming"); // future
    expect(byDate.get("2026-09-13")).toBe("rest_day"); // future closed day
  });

  it("a check-in on a closed day still reads as checked_in", () => {
    const grid = buildMonthGrid({
      month: "2026-09",
      today: "2026-09-10",
      checkins: ["2026-09-06"],
      closed: ["2026-09-06"],
    });
    const day = grid.weeks.flat().find((d) => d.date === "2026-09-06");
    expect(day!.state).toBe("checked_in");
  });

  it("supports a Monday week start", () => {
    const grid = buildMonthGrid({ ...base, weekStartsOn: 1 });
    expect(grid.weekdayOrder).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(grid.weeks[0]![0]!.weekday).toBe(1);
    expect(grid.weeks.at(-1)!.at(-1)!.weekday).toBe(0);
  });

  it("falls back to today's month when the month string is malformed", () => {
    const grid = buildMonthGrid({ ...base, month: "nope" });
    expect(grid.month).toBe("2026-09");
  });

  it("handles a 28-day February", () => {
    const grid = buildMonthGrid({
      month: "2027-02",
      today: "2027-02-15",
      checkins: [],
      closed: [],
    });
    const inMonth = grid.weeks.flat().filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(28);
    expect(inMonth.at(-1)!.date).toBe("2027-02-28");
  });
});
