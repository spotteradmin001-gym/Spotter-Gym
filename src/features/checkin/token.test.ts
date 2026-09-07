import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  currentCheckinToken,
  verifyCheckinToken,
  WINDOW_MS,
} from "./token";

const prev = process.env.SESSION_SECRET;
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-for-checkin-tokens";
});
afterAll(() => {
  if (prev === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = prev;
});

describe("checkin token", () => {
  const now = 1_800_000_000_000;

  it("verifies a token from the current window", () => {
    const t = currentCheckinToken("gym-1", now);
    expect(verifyCheckinToken("gym-1", t, now)).toBe(true);
  });

  it("accepts the previous window (±1) but not older", () => {
    const t = currentCheckinToken("gym-1", now);
    expect(verifyCheckinToken("gym-1", t, now + WINDOW_MS)).toBe(true);
    expect(verifyCheckinToken("gym-1", t, now + 3 * WINDOW_MS)).toBe(false);
  });

  it("rejects a token for a different gym and an empty token", () => {
    const t = currentCheckinToken("gym-1", now);
    expect(verifyCheckinToken("gym-2", t, now)).toBe(false);
    expect(verifyCheckinToken("gym-1", "", now)).toBe(false);
    expect(verifyCheckinToken("gym-1", "garbage", now)).toBe(false);
  });
});
