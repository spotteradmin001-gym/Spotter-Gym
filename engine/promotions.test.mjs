import { describe, expect, it } from "vitest";

import {
  nextPartStatus,
  promoBudgetRemaining,
  promotionFinalState,
  randomGapMs,
  recipientPartPlan,
  recipientResolved,
  shouldAutoPause,
  withinSendWindow,
} from "./promotions.mjs";

describe("promoBudgetRemaining", () => {
  it("is cap − reserve − transactional − promo-so-far, floored at zero", () => {
    expect(
      promoBudgetRemaining({
        dailyCap: 200,
        reserve: 60,
        transactionalToday: 12,
        promoSentToday: 30,
      }),
    ).toBe(98);
    expect(
      promoBudgetRemaining({ dailyCap: 40, reserve: 60, transactionalToday: 5 }),
    ).toBe(0);
  });
});

describe("randomGapMs", () => {
  it("stays within 5–12 s", () => {
    expect(randomGapMs(() => 0)).toBe(5000);
    expect(randomGapMs(() => 1)).toBe(12000);
    expect(randomGapMs(() => 0.5)).toBe(8500);
  });
});

describe("withinSendWindow", () => {
  it("respects the gym timezone", () => {
    // 03:30 UTC = 09:00 IST → inside; 15:30 UTC = 21:00 IST → outside
    const morning = new Date("2026-09-08T03:30:00Z");
    const night = new Date("2026-09-08T15:30:00Z");
    expect(withinSendWindow(morning, "Asia/Kolkata")).toBe(true);
    expect(withinSendWindow(night, "Asia/Kolkata")).toBe(false);
  });
});

describe("recipientPartPlan", () => {
  it("sends present parts for a registered number", () => {
    expect(recipientPartPlan({ waExists: true, hasText: true, hasImage: true })).toEqual({
      text: "send",
      image: "send",
    });
    expect(recipientPartPlan({ waExists: null, hasText: true, hasImage: false })).toEqual({
      text: "send",
      image: "n/a",
    });
  });

  it("skips both present parts when the number is not on WhatsApp", () => {
    expect(recipientPartPlan({ waExists: false, hasText: true, hasImage: true })).toEqual({
      text: "skip",
      image: "skip",
    });
    expect(recipientPartPlan({ waExists: false, hasText: false, hasImage: true })).toEqual({
      text: "n/a",
      image: "skip",
    });
  });
});

describe("nextPartStatus", () => {
  it("succeeds, then retries to the cap", () => {
    expect(nextPartStatus({ attempts: 0, ok: true, maxAttempts: 3 })).toEqual({
      status: "sent",
      attempts: 1,
    });
    expect(nextPartStatus({ attempts: 0, ok: false, maxAttempts: 3 })).toEqual({
      status: "pending",
      attempts: 1,
    });
    expect(nextPartStatus({ attempts: 2, ok: false, maxAttempts: 3 })).toEqual({
      status: "failed",
      attempts: 3,
    });
  });
});

describe("recipientResolved", () => {
  it("is true only when both parts are terminal", () => {
    expect(recipientResolved({ textStatus: "sent", imageStatus: "n/a" })).toBe(true);
    expect(recipientResolved({ textStatus: "sent", imageStatus: "pending" })).toBe(false);
    expect(recipientResolved({ textStatus: "skipped", imageStatus: "skipped" })).toBe(true);
  });
});

describe("promotionFinalState", () => {
  const cfg = { perMessagePaise: 50, prepaidPaise: 12_000 };

  it("all parts delivered → sent, billed = delivered × per-message, no refund", () => {
    const parts = Array.from({ length: 120 }, () => ({
      textStatus: "sent",
      imageStatus: "sent",
    }));
    const f = promotionFinalState(parts, cfg);
    expect(f.status).toBe("sent");
    expect(f.deliveredParts).toBe(240);
    expect(f.billedTotalPaise).toBe(12_000);
    expect(f.refundPaise).toBe(0);
    expect(f.settlement).toBe("settled");
  });

  it("some parts failed/skipped → partly_failed, refund the undelivered", () => {
    const parts = [
      { textStatus: "sent", imageStatus: "sent" },
      { textStatus: "sent", imageStatus: "failed" },
      { textStatus: "skipped", imageStatus: "skipped" },
    ];
    const f = promotionFinalState(parts, { perMessagePaise: 50, prepaidPaise: 300 });
    expect(f.status).toBe("partly_failed");
    expect(f.deliveredParts).toBe(3);
    expect(f.billedTotalPaise).toBe(150);
    expect(f.refundPaise).toBe(150);
    expect(f.settlement).toBe("refund_due");
  });

  it("nothing delivered → failed, full refund", () => {
    const parts = [
      { textStatus: "failed", imageStatus: "n/a" },
      { textStatus: "skipped", imageStatus: "n/a" },
    ];
    const f = promotionFinalState(parts, { perMessagePaise: 50, prepaidPaise: 100 });
    expect(f.status).toBe("failed");
    expect(f.billedTotalPaise).toBe(0);
    expect(f.refundPaise).toBe(100);
  });
});

describe("shouldAutoPause", () => {
  it("ignores a small sample, trips on a >=50% failure rate", () => {
    expect(shouldAutoPause({ attempted: 4, failed: 4 })).toBe(false);
    expect(shouldAutoPause({ attempted: 12, failed: 5 })).toBe(false);
    expect(shouldAutoPause({ attempted: 12, failed: 6 })).toBe(true);
    expect(shouldAutoPause({ attempted: 20, failed: 18 })).toBe(true);
  });
});
