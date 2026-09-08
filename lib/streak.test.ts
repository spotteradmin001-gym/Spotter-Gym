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

  it("counts consecutive open days ending today", () => {
    expect(
      currentStreak({ checkins: ["2026-09-08", "2026-09-07", "2026-09-06"], today }),
    ).toBe(3);
  });

  it("still counts when the latest check-in was yesterday (today in progress)", () => {
    expect(currentStreak({ checkins: ["2026-09-07", "2026-09-06"], today })).toBe(2);
  });

  it("breaks once a fully-elapsed open day was missed", () => {
    // today missed AND yesterday missed → the run ended before yesterday
    expect(currentStreak({ checkins: ["2026-09-05", "2026-09-04"], today })).toBe(0);
  });

  it("stops at the first missed open day inside the run", () => {
    expect(
      currentStreak({
        checkins: ["2026-09-08", "2026-09-07", "2026-09-05", "2026-09-04"],
        today,
      }),
    ).toBe(2);
  });

  it("is 0 for no check-ins and ignores order / duplicates", () => {
    expect(currentStreak({ checkins: [], today })).toBe(0);
    expect(
      currentStreak({
        checkins: ["2026-09-06", "2026-09-08", "2026-09-07", "2026-09-08"],
        today,
      }),
    ).toBe(3);
  });

  it("skips a weekly closed day — it neither requires a check-in nor breaks the run", () => {
    // 2026-09-06 is a Sunday; the gym is closed, member did not check in
    expect(
      currentStreak({
        checkins: ["2026-09-08", "2026-09-07", "2026-09-05"],
        closed: ["2026-09-06"],
        today,
      }),
    ).toBe(3);
  });

  it("skips a one-off holiday the same way", () => {
    expect(
      currentStreak({
        checkins: ["2026-09-08", "2026-09-05", "2026-09-04"],
        closed: ["2026-09-07", "2026-09-06"], // holiday + Sunday, both open-free
        today,
      }),
    ).toBe(3);
  });

  it("still counts a check-in made on a closed day", () => {
    expect(
      currentStreak({
        checkins: ["2026-09-08", "2026-09-07", "2026-09-06", "2026-09-05"],
        closed: ["2026-09-06"],
        today,
      }),
    ).toBe(4);
  });

  it("a missed open day breaks the run when there is no buffer", () => {
    expect(
      currentStreak({
        checkins: ["2026-09-08", "2026-09-07", "2026-09-05"],
        closed: [], // 2026-09-06 is now an open day that was missed
        today,
      }),
    ).toBe(2);
  });

  it("forgives missed open days up to the buffer, breaking on the (buffer+1)th", () => {
    const checkins = ["2026-09-08", "2026-09-05", "2026-09-02"];
    // open misses walking back: 09-07, 09-06, then 09-04, 09-03
    expect(currentStreak({ checkins, today, allowedMisses: 1 })).toBe(1); // 09-08 only; breaks on the 2nd miss (09-06)
    expect(currentStreak({ checkins, today, allowedMisses: 2 })).toBe(2); // 09-08, 09-05; breaks on the 3rd miss (09-04)
    expect(currentStreak({ checkins, today, allowedMisses: 4 })).toBe(3); // reaches 09-02
  });

  it("does not count today's own gap against the buffer", () => {
    // today open + unchecked, yesterday checked, buffer 0 → still 1
    expect(
      currentStreak({ checkins: ["2026-09-07"], today, allowedMisses: 0 }),
    ).toBe(1);
  });

  it("anchor-day cycle: a clean run across a month of open days with Sundays closed", () => {
    // A member who checked in every open day from 2026-08-12 to 2026-09-11,
    // Sundays (Aug 16/23/30, Sep 6) closed. today = 2026-09-11.
    const closed = ["2026-08-16", "2026-08-23", "2026-08-30", "2026-09-06"];
    const checkins: string[] = [];
    for (let d = "2026-08-12"; d <= "2026-09-11"; d = addDays(d, 1)) {
      if (!closed.includes(d)) checkins.push(d);
    }
    expect(
      currentStreak({ checkins, closed, today: "2026-09-11", allowedMisses: 0 }),
    ).toBe(checkins.length);
  });
});
