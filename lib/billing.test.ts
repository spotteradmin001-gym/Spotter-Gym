import { describe, expect, it } from "vitest";

import {
  addMonths,
  billingCycleWindow,
  dueDateFor,
  duePeriodsFor,
  periodMonthOf,
  reportRange,
  weekdayOf,
} from "./billing";

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

  it("reportRange spans month / quarter / year ending on asOf", () => {
    expect(reportRange("month", "2026-09-17")).toEqual({
      from: "2026-09-01",
      to: "2026-09-17",
    });
    expect(reportRange("quarter", "2026-09-17")).toEqual({
      from: "2026-07-01",
      to: "2026-09-17",
    });
    expect(reportRange("year", "2026-09-17")).toEqual({
      from: "2025-10-01",
      to: "2026-09-17",
    });
  });
});

describe("weekdayOf", () => {
  it("returns 0 for Sunday and 6 for Saturday", () => {
    expect(weekdayOf("2026-09-06")).toBe(0); // Sunday
    expect(weekdayOf("2026-09-08")).toBe(2); // Tuesday
    expect(weekdayOf("2026-09-12")).toBe(6); // Saturday
  });
});

describe("billingCycleWindow (anchor-day cycle)", () => {
  it("ref after the anchor day → cycle starts this month", () => {
    expect(billingCycleWindow(12, "2026-09-20")).toEqual({
      start: "2026-09-12",
      end: "2026-10-12",
    });
  });

  it("ref before the anchor day → cycle started last month", () => {
    expect(billingCycleWindow(12, "2026-09-05")).toEqual({
      start: "2026-08-12",
      end: "2026-09-12",
    });
  });

  it("ref exactly on the anchor day is the first day of that cycle", () => {
    expect(billingCycleWindow(12, "2026-09-12")).toEqual({
      start: "2026-09-12",
      end: "2026-10-12",
    });
  });

  it("rolls the year over at both ends", () => {
    expect(billingCycleWindow(15, "2027-01-03")).toEqual({
      start: "2026-12-15",
      end: "2027-01-15",
    });
    expect(billingCycleWindow(15, "2026-12-20")).toEqual({
      start: "2026-12-15",
      end: "2027-01-15",
    });
  });

  it("accepts a Date and anchor day 1", () => {
    expect(billingCycleWindow(1, new Date("2026-09-17T09:00:00Z"))).toEqual({
      start: "2026-09-01",
      end: "2026-10-01",
    });
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
