import { describe, expect, it } from "vitest";

import {
  estimate,
  finalBill,
  partsPerRecipient,
  PromoCostError,
  refundPaise,
  settlementOutcome,
} from "./promo-cost";

describe("partsPerRecipient", () => {
  it("counts the billable parts", () => {
    expect(partsPerRecipient({ hasText: true, hasImage: true })).toBe(2);
    expect(partsPerRecipient({ hasText: true, hasImage: false })).toBe(1);
    expect(partsPerRecipient({ hasText: false, hasImage: true })).toBe(1);
    expect(partsPerRecipient({ hasText: false, hasImage: false })).toBe(0);
  });
});

describe("estimate", () => {
  it("is per_message * parts * recipients", () => {
    const e = estimate({
      perMessagePaise: 50,
      parts: { hasText: true, hasImage: true },
      recipientCount: 120,
    });
    expect(e.partsPerRecipient).toBe(2);
    expect(e.totalMessages).toBe(240);
    expect(e.estimatedTotalPaise).toBe(12_000);
  });

  it("handles a text-only promotion and a zero recipient count", () => {
    expect(
      estimate({
        perMessagePaise: 75,
        parts: { hasText: true, hasImage: false },
        recipientCount: 10,
      }).estimatedTotalPaise,
    ).toBe(750);
    expect(
      estimate({
        perMessagePaise: 75,
        parts: { hasText: true, hasImage: false },
        recipientCount: 0,
      }).estimatedTotalPaise,
    ).toBe(0);
  });

  it("rejects a partless promotion and non-integer / negative inputs", () => {
    expect(() =>
      estimate({
        perMessagePaise: 50,
        parts: { hasText: false, hasImage: false },
        recipientCount: 10,
      }),
    ).toThrow(PromoCostError);
    expect(() =>
      estimate({
        perMessagePaise: -1,
        parts: { hasText: true, hasImage: false },
        recipientCount: 10,
      }),
    ).toThrow(/per-message/);
    expect(() =>
      estimate({
        perMessagePaise: 1.5,
        parts: { hasText: true, hasImage: false },
        recipientCount: 10,
      }),
    ).toThrow(PromoCostError);
  });
});

describe("finalBill / refund / settlement", () => {
  it("bills delivered parts only", () => {
    expect(finalBill({ perMessagePaise: 50, deliveredParts: 233 }).billedTotalPaise).toBe(
      11_650,
    );
    expect(finalBill({ perMessagePaise: 50, deliveredParts: 0 }).billedTotalPaise).toBe(0);
  });

  it("refund is prepaid - billed, never negative", () => {
    expect(refundPaise(12_000, 11_650)).toBe(350);
    expect(refundPaise(12_000, 12_000)).toBe(0);
    // the real bill can never exceed the estimate, but guard anyway
    expect(refundPaise(12_000, 13_000)).toBe(0);
  });

  it("settlement is refund_due when the owner overpaid, else settled", () => {
    expect(settlementOutcome(12_000, 11_650)).toBe("refund_due");
    expect(settlementOutcome(12_000, 12_000)).toBe("settled");
  });
});
