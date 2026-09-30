import { describe, expect, it } from "vitest";

import { normalizePhone } from "./phone";
import { maskPhone, planRepairs, repairPhone } from "./phone-repair";

describe("repairPhone", () => {
  it("restores the lost 91 on an 8-digit +91 number", () => {
    expect(repairPhone("+9123456789")).toBe("+919123456789");
    expect(repairPhone(" +9198765432 ")).toBe("+919198765432");
  });

  it("leaves correct and foreign numbers alone", () => {
    for (const ok of ["+919123456789", "+917584928285", "+12025550123", "+44791112345", "", null, undefined]) {
      expect(repairPhone(ok)).toBeNull();
    }
  });

  it("repairs to what the fixed normaliser now stores for the same typed number", () => {
    // The owner typed "91234 56789"; the old code stored +9123456789.
    expect(repairPhone("+9123456789")).toBe(normalizePhone("91234 56789"));
  });
});

describe("maskPhone", () => {
  it("keeps the country code and last 4 digits", () => {
    expect(maskPhone("+919123456789")).toBe("+91******6789");
    expect(maskPhone("+9123456789")).toBe("+91****6789");
    expect(maskPhone("123")).toBe("123");
  });
});

describe("planRepairs", () => {
  it("plans a change per broken row", () => {
    const { changes, collisions } = planRepairs(
      [
        { id: "m1", scope: "g1", phone: "+9123456789" },
        { id: "m2", scope: "g1", phone: "+917584928285" },
      ],
      new Set(["g1|+917584928285"]),
    );
    expect(changes).toEqual([{ id: "m1", scope: "g1", from: "+9123456789", to: "+919123456789" }]);
    expect(collisions).toEqual([]);
  });

  it("reports, never overwrites, a number already saved in the same scope", () => {
    const { changes, collisions } = planRepairs(
      [
        { id: "m1", scope: "g1", phone: "+9123456789" },
        { id: "m3", scope: "g2", phone: "+9123456789" },
      ],
      new Set(["g1|+919123456789"]),
    );
    expect(changes.map((c) => c.id)).toEqual(["m3"]); // other gym: no clash
    expect(collisions).toMatchObject([{ id: "m1", reason: expect.stringMatching(/already saved/) }]);
  });

  it("reports two broken rows that would repair to the same number", () => {
    const { changes, collisions } = planRepairs(
      [
        { id: "a", scope: "p1", phone: "+9123456789" },
        { id: "b", scope: "p1", phone: " +9123456789" },
      ],
      new Set(),
    );
    expect(changes.map((c) => c.id)).toEqual(["a"]);
    expect(collisions).toMatchObject([{ id: "b", reason: expect.stringMatching(/same number/) }]);
  });
});
