import { describe, expect, it } from "vitest";

import { normalizePhone, PhoneError, toWhatsAppChatId } from "./phone";

describe("normalizePhone", () => {
  it("adds the default country code to a bare local number", () => {
    expect(normalizePhone("7584928285")).toBe("+917584928285");
    expect(normalizePhone("075849 28285")).toBe("+917584928285");
    expect(normalizePhone("(758) 492-8285")).toBe("+917584928285");
  });

  it("accepts an already-international number", () => {
    expect(normalizePhone("+91 75849 28285")).toBe("+917584928285");
    expect(normalizePhone("0091-7584928285")).toBe("+917584928285");
    expect(normalizePhone("917584928285")).toBe("+917584928285");
  });

  it("respects an explicit country", () => {
    expect(normalizePhone("2025550123", "1")).toBe("+12025550123");
  });

  it("rejects nonsense", () => {
    expect(() => normalizePhone("abc")).toThrow(PhoneError);
    expect(() => normalizePhone("123")).toThrow(PhoneError);
  });
});

describe("toWhatsAppChatId", () => {
  it("drops the plus and appends @c.us", () => {
    expect(toWhatsAppChatId("+917584928285")).toBe("917584928285@c.us");
  });
});
