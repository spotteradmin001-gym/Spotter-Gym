import { describe, expect, it } from "vitest";

import { addMonths, dueDateFor, duePeriodsFor, periodMonthOf } from "./billing";

describe("period arithmetic", () => {
  it("periodMonthOf snaps to the first of the month", () => {
    expect(periodMonthOf("2026-09-17")).toBe("2026-09-01");
    expect(periodMonthOf(new Date("2026-12-31T23:00:00Z"))).toBe("2026-12-01");
  });

  it("addMonths rolls the year over", () => {
    expect(addMonths("2026-09-01", 1)).toBe("2026-10-01");
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("dueDateFor pins the anchor day", () => {
    expect(dueDateFor("2026-09-01", 5)).toBe("2026-09-05");
    expect(dueDateFor("2026-09-01", 20)).toBe("2026-09-20");
  });
});

describe("duePeriodsFor (no proration)", () => {
  it("returns the current and next period", () => {
    const p = duePeriodsFor({ asOf: "2026-09-10", joinDate: "2026-01-01", anchorDay: 1 });
    expect(p.map((x) => x.periodMonth)).toEqual(["2026-09-01", "2026-10-01"]);
    expect(p.map((x) => x.dueDate)).toEqual(["2026-09-01", "2026-10-01"]);
  });

  it("skips a first period whose due date precedes the join date", () => {
    // joined 15 Sep, anchor day 1 → 1 Sep due is before joining → first due is 1 Oct
    const p = duePeriodsFor({ asOf: "2026-09-20", joinDate: "2026-09-15", anchorDay: 1 });
    expect(p.map((x) => x.dueDate)).toEqual(["2026-10-01"]);
  });

  it("keeps the current period when its anchor day is on/after the join date", () => {
    // joined 15 Sep, anchor day 20 → 20 Sep is after joining → first due is 20 Sep
    const p = duePeriodsFor({ asOf: "2026-09-16", joinDate: "2026-09-15", anchorDay: 20 });
    expect(p.map((x) => x.dueDate)).toEqual(["2026-09-20", "2026-10-20"]);
  });
});
