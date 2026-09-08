import { describe, expect, it } from "vitest";

import {
  ACCURACY_THRESHOLD_M,
  accuracyWarning,
  formatAccuracy,
} from "./geo-accuracy";

describe("accuracyWarning", () => {
  it("passes a tight fix", () => {
    expect(accuracyWarning(8)).toBeNull();
    expect(accuracyWarning(ACCURACY_THRESHOLD_M)).toBeNull();
  });

  it("warns on a loose fix and names the distance", () => {
    const msg = accuracyWarning(240);
    expect(msg).toMatch(/240 m/);
    expect(msg).toMatch(/fence/);
  });

  it("warns just past the threshold", () => {
    expect(accuracyWarning(ACCURACY_THRESHOLD_M + 1)).not.toBeNull();
  });

  it("warns when the device reports no usable accuracy", () => {
    expect(accuracyWarning(0)).not.toBeNull();
    expect(accuracyWarning(-1)).not.toBeNull();
    expect(accuracyWarning(Number.NaN)).not.toBeNull();
  });
});

describe("formatAccuracy", () => {
  it("rounds to whole metres", () => {
    expect(formatAccuracy(12.4)).toBe("±12 m");
  });

  it("handles a missing value", () => {
    expect(formatAccuracy(0)).toBe("accuracy unknown");
    expect(formatAccuracy(Number.NaN)).toBe("accuracy unknown");
  });
});
