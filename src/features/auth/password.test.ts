import { describe, expect, it } from "vitest";

import {
  generatePassword,
  hashPassword,
  isPasswordStrongEnough,
  verifyPassword,
} from "./password";

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password (round trip)", () => {
    const stored = hashPassword("SeriousStartup#2026");
    expect(verifyPassword("SeriousStartup#2026", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword("SeriousStartup#2026");
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("never stores the plaintext password", () => {
    const stored = hashPassword("SeriousStartup#2026");
    expect(stored).not.toContain("SeriousStartup#2026");
  });

  it("salts each hash differently for the same password", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password", a)).toBe(true);
    expect(verifyPassword("same-password", b)).toBe(true);
  });

  it("rejects a malformed stored value instead of throwing", () => {
    expect(verifyPassword("anything", "not-a-valid-stored-hash")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
    expect(verifyPassword("anything", "abc:")).toBe(false);
  });
});

describe("generatePassword", () => {
  it("generates a password of the requested length", () => {
    expect(generatePassword(14)).toHaveLength(14);
    expect(generatePassword(20)).toHaveLength(20);
  });

  it("never includes visually ambiguous characters", () => {
    expect(generatePassword(500)).not.toMatch(/[0O1lI]/);
  });

  it("generates a different password each call", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });

  it("clears isPasswordStrongEnough's own bar", () => {
    expect(isPasswordStrongEnough(generatePassword())).toBe(true);
  });
});

describe("isPasswordStrongEnough", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(isPasswordStrongEnough("short")).toBe(false);
    expect(isPasswordStrongEnough("1234567")).toBe(false);
  });

  it("accepts passwords at or above the minimum length", () => {
    expect(isPasswordStrongEnough("12345678")).toBe(true);
    expect(isPasswordStrongEnough("SeriousStartup#2026")).toBe(true);
  });
});
