import { describe, expect, it } from "vitest";

import { EMPLOYEE_PERMISSIONS, PERMISSION_LABELS } from "./permissions";

describe("employee permissions", () => {
  it("includes promotion.create with a label", () => {
    expect(EMPLOYEE_PERMISSIONS).toContain("promotion.create");
    expect(PERMISSION_LABELS["promotion.create"]).toBe("Create promotions");
  });

  it("has a label for every permission", () => {
    for (const perm of EMPLOYEE_PERMISSIONS) {
      expect(typeof PERMISSION_LABELS[perm]).toBe("string");
      expect(PERMISSION_LABELS[perm].length).toBeGreaterThan(0);
    }
  });
});
