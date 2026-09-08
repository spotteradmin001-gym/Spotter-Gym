import { describe, expect, it } from "vitest";

import { waLink } from "./wa-link";

describe("waLink", () => {
  it("builds a bare chat link from a local number", () => {
    expect(waLink("7584928285")).toBe("https://wa.me/917584928285");
  });

  it("normalises an already-international number", () => {
    expect(waLink("+91 75849 28285")).toBe("https://wa.me/917584928285");
    expect(waLink("0091-7584928285")).toBe("https://wa.me/917584928285");
  });

  it("url-encodes the message text", () => {
    const link = waLink("7584928285", "Hi & welcome to Spotter! Link: https://x.io/a?b=1");
    expect(link).toBe(
      "https://wa.me/917584928285?text=Hi%20%26%20welcome%20to%20Spotter!%20Link%3A%20https%3A%2F%2Fx.io%2Fa%3Fb%3D1",
    );
  });

  it("ignores an empty or whitespace message", () => {
    expect(waLink("7584928285", "")).toBe("https://wa.me/917584928285");
    expect(waLink("7584928285", "   ")).toBe("https://wa.me/917584928285");
  });

  it("returns null for a missing or unusable phone", () => {
    expect(waLink(null)).toBeNull();
    expect(waLink(undefined)).toBeNull();
    expect(waLink("")).toBeNull();
    expect(waLink("   ")).toBeNull();
    expect(waLink("abc")).toBeNull();
    expect(waLink("123")).toBeNull();
  });
});
