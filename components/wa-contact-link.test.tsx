import { isValidElement } from "react";
import { describe, expect, it } from "vitest";

import { ShareViaWhatsApp } from "./share-via-whatsapp";
import { WaContactLink } from "./wa-contact-link";

/**
 * These components are thin guards over `waLink` — the point of the test is
 * that they render nothing without a usable phone. Called directly (no DOM):
 * a function component returns `null` or a React element.
 */

describe("WaContactLink", () => {
  it("renders nothing without a usable phone", () => {
    expect(WaContactLink({ phone: null })).toBeNull();
    expect(WaContactLink({ phone: "" })).toBeNull();
    expect(WaContactLink({ phone: "not-a-number" })).toBeNull();
  });

  it("renders a link when the phone is usable", () => {
    const el = WaContactLink({ phone: "7584928285" });
    expect(isValidElement(el)).toBe(true);
    expect((el as { props: { href: string } }).props.href).toBe(
      "https://wa.me/917584928285",
    );
  });
});

describe("ShareViaWhatsApp", () => {
  it("renders nothing without a usable phone", () => {
    expect(ShareViaWhatsApp({ phone: null, message: "hello" })).toBeNull();
  });

  it("renders a link carrying the encoded message", () => {
    const el = ShareViaWhatsApp({ phone: "7584928285", message: "hello there" });
    expect(isValidElement(el)).toBe(true);
    expect((el as { props: { href: string } }).props.href).toBe(
      "https://wa.me/917584928285?text=hello%20there",
    );
  });
});
