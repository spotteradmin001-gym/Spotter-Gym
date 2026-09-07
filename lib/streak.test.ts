import { describe, expect, it } from "vitest";

import { addDays, currentStreak } from "./streak";

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("currentStreak", () => {
  const today = "2026-09-08";

  it("counts consecutive days ending today", () => {
    expect(currentStreak(["2026-09-08", "2026-09-07", "2026-09-06"], today)).toBe(3);
  });

  it("still counts when the latest check-in was yesterday", () => {
    expect(currentStreak(["2026-09-07", "2026-09-06"], today)).toBe(2);
  });

  it("is 0 when the latest check-in is 2+ days ago", () => {
    expect(currentStreak(["2026-09-05", "2026-09-04"], today)).toBe(0);
  });

  it("stops at the first gap", () => {
    expect(
      currentStreak(["2026-09-08", "2026-09-07", "2026-09-05", "2026-09-04"], today),
    ).toBe(2);
  });

  it("is 0 for no check-ins and ignores order / duplicates", () => {
    expect(currentStreak([], today)).toBe(0);
    expect(currentStreak(["2026-09-06", "2026-09-08", "2026-09-07", "2026-09-08"], today)).toBe(3);
  });
});
