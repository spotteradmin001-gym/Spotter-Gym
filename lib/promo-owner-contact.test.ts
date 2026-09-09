import { describe, expect, it } from "vitest";

import {
  maskPhone,
  ownerContactChoices,
  selectedOwnerPhone,
} from "./promo-owner-contact";

describe("maskPhone", () => {
  it("keeps the first two and last two digits, bullets the rest", () => {
    expect(maskPhone("+919812345678")).toBe("+91 •••••••• 78");
    expect(maskPhone("9812345678")).toBe("98 •••••• 78");
  });

  it("returns a too-short value unchanged", () => {
    expect(maskPhone("123")).toBe("123");
    expect(maskPhone("")).toBe("");
  });
});

describe("ownerContactChoices", () => {
  const owners = [
    { id: "a", email: "amy@gym.test", phone: "+919800000001" },
    { id: "b", email: "ben@gym.test", phone: null },
    { id: "c", email: "cid@gym.test", phone: "  " },
    { id: "d", email: "dan@gym.test", phone: "+919800000004" },
  ];

  it("keeps only owners with a real phone, in input order, with a masked label", () => {
    const choices = ownerContactChoices(owners);
    expect(choices.map((c) => c.id)).toEqual(["a", "d"]);
    expect(choices[0]!.label).toBe("amy@gym.test · +91 •••••••• 01");
    expect(choices[0]!.phone).toBe("+919800000001");
  });

  it("returns an empty list when no owner has a phone", () => {
    expect(ownerContactChoices([{ id: "b", email: "ben@gym.test", phone: null }])).toEqual(
      [],
    );
  });
});

describe("selectedOwnerPhone", () => {
  const choices = ownerContactChoices([
    { id: "a", email: "amy@gym.test", phone: "+919800000001" },
    { id: "d", email: "dan@gym.test", phone: "+919800000004" },
  ]);

  it("returns the chosen owner's phone", () => {
    expect(selectedOwnerPhone(choices, "d")).toBe("+919800000004");
  });

  it("falls back to the first choice for a missing or unknown id", () => {
    expect(selectedOwnerPhone(choices, null)).toBe("+919800000001");
    expect(selectedOwnerPhone(choices, "zzz")).toBe("+919800000001");
  });

  it("returns null when there are no choices", () => {
    expect(selectedOwnerPhone([], "a")).toBeNull();
  });
});
