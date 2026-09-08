import { describe, expect, it } from "vitest";

import { QUOTES, pickQuote } from "./quotes";

describe("QUOTES", () => {
  it("is a non-trivial, prime-length list of short unique lines", () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(20);
    // prime length is what makes the weekly no-repeat guarantee hold
    const isPrime = (x: number) => {
      for (let i = 2; i * i <= x; i++) if (x % i === 0) return false;
      return x > 1;
    };
    expect(isPrime(QUOTES.length)).toBe(true);
    expect(new Set(QUOTES).size).toBe(QUOTES.length);
    for (const q of QUOTES) {
      expect(q.trim().length).toBeGreaterThan(0);
      expect(q.length).toBeLessThanOrEqual(90);
    }
  });
});

describe("pickQuote", () => {
  it("is deterministic for a given seed", () => {
    expect(pickQuote(42)).toBe(pickQuote(42));
    expect(pickQuote("2026-09-08")).toBe(pickQuote("2026-09-08"));
  });

  it("always returns a member of QUOTES", () => {
    for (let s = -20; s < 400; s++) expect(QUOTES).toContain(pickQuote(s));
  });

  it("never repeats within any rolling seven-day window", () => {
    for (let start = -30; start < 370; start++) {
      const window = Array.from({ length: 7 }, (_, i) => pickQuote(start + i));
      expect(new Set(window).size).toBe(7);
    }
  });

  it("accepts a YYYY-MM-DD string equivalently to its day number", () => {
    const day = Math.floor(Date.parse("2026-09-08T00:00:00Z") / 86_400_000);
    expect(pickQuote("2026-09-08")).toBe(pickQuote(day));
  });

  it("moves on over consecutive days", () => {
    expect(pickQuote("2026-09-08")).not.toBe(pickQuote("2026-09-09"));
  });

  it("falls back safely for a malformed seed", () => {
    expect(QUOTES).toContain(pickQuote("not-a-date"));
    expect(QUOTES).toContain(pickQuote(Number.NaN));
  });
});
