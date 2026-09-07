import { describe, expect, it } from "vitest";

import { hitRateLimit, MAX_ATTEMPTS, resetRateLimit } from "./rate-limit";

describe("hitRateLimit", () => {
  it("allows up to MAX_ATTEMPTS then blocks", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(hitRateLimit(key).ok).toBe(true);
    }
    const blocked = hitRateLimit(key);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("resetRateLimit clears the counter", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < MAX_ATTEMPTS + 3; i++) hitRateLimit(key);
    expect(hitRateLimit(key).ok).toBe(false);

    resetRateLimit(key);
    expect(hitRateLimit(key).ok).toBe(true);
  });

  it("keys are independent", () => {
    const a = `test-a-${Math.random()}`;
    const b = `test-b-${Math.random()}`;
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) hitRateLimit(a);
    expect(hitRateLimit(a).ok).toBe(false);
    expect(hitRateLimit(b).ok).toBe(true);
  });
});
