import { describe, expect, it } from "vitest";

import {
  employeeWelcomeMessage,
  memberActivationMessage,
  ownerWelcomeMessage,
  passwordResetMessage,
  promotionBillMessage,
  promotionQuoteMessage,
} from "./wa-templates";

describe("staff welcome messages", () => {
  const base = {
    gymName: "Iron Works",
    loginUrl: "https://spotter.app/login",
    email: "sam@example.com",
    tempPassword: "Hunter#42xy",
  };

  it("owner welcome names the gym and leads with the login URL", () => {
    const msg = ownerWelcomeMessage({ ...base, name: "Sam" });
    expect(msg).toContain("Hi Sam,");
    expect(msg).toContain("owner login for Iron Works");
    expect(msg.indexOf("https://spotter.app/login")).toBeLessThan(
      msg.indexOf("Hunter#42xy"),
    );
  });

  it("employee welcome says staff login", () => {
    expect(employeeWelcomeMessage(base)).toContain("staff login for Iron Works");
  });

  it("falls back to a plain greeting without a name", () => {
    expect(ownerWelcomeMessage(base).startsWith("Hi,\n")).toBe(true);
  });
});

describe("memberActivationMessage", () => {
  it("leads with the activation link", () => {
    const msg = memberActivationMessage({
      name: "Priya",
      gymName: "Iron Works",
      activationLink: "https://spotter.app/activate/abc123",
    });
    expect(msg).toContain("Hi Priya,");
    expect(msg).toContain("https://spotter.app/activate/abc123");
    expect(msg).toContain("valid 7 days");
  });
});

describe("passwordResetMessage", () => {
  it("prefers a reset link and never prints a password alongside it", () => {
    const msg = passwordResetMessage({
      gymName: "Iron Works",
      email: "sam@example.com",
      resetLink: "https://spotter.app/reset-password/tok",
      tempPassword: "ShouldNotAppear1",
    });
    expect(msg).toContain("https://spotter.app/reset-password/tok");
    expect(msg).not.toContain("ShouldNotAppear1");
  });

  it("uses the temporary password when there is no link", () => {
    const msg = passwordResetMessage({
      gymName: "Iron Works",
      email: "sam@example.com",
      tempPassword: "Fresh#Pass9",
    });
    expect(msg).toContain("Fresh#Pass9");
    expect(msg).toContain("set your own password");
  });
});

describe("promotion quote / bill messages", () => {
  it("quote surfaces the counts, per-message charge and estimate", () => {
    const msg = promotionQuoteMessage({
      gymName: "Iron Works",
      recipientCount: 120,
      partsPerRecipient: 2,
      perMessagePaise: 50,
      estimatedTotalPaise: 12_000,
    });
    expect(msg).toContain("Iron Works");
    expect(msg).toContain("Recipients: 120");
    expect(msg).toContain("Messages per recipient: 2");
    expect(msg).toContain("₹0.50");
    expect(msg).toContain("₹120.00");
  });

  it("bill shows a refund line only when money is owed back", () => {
    const withRefund = promotionBillMessage({
      gymName: "Iron Works",
      deliveredParts: 233,
      perMessagePaise: 50,
      billedTotalPaise: 11_650,
      prepaidPaise: 12_000,
      refundPaise: 350,
    });
    expect(withRefund).toContain("Delivered messages: 233");
    expect(withRefund).toContain("Refund due to you: ₹3.50");

    const exact = promotionBillMessage({
      gymName: "Iron Works",
      deliveredParts: 240,
      perMessagePaise: 50,
      billedTotalPaise: 12_000,
      prepaidPaise: 12_000,
      refundPaise: 0,
    });
    expect(exact).not.toContain("Refund due");
    expect(exact).toContain("Fully settled");
  });
});
