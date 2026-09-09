/**
 * Integration test for db/queries/promotions.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset.
 *
 * FIND-MY-FIXTURE: every gym this file makes is named `test_promo %`; cleanup
 * deletes promotions/recipients by gym id and gyms/members by that prefix.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms, members, promotionRecipients, promotions } from "@/db/schema";

import { createGym } from "./gyms";
import { createMember } from "./members";
import {
  PromotionError,
  acknowledgePromotionPrepaid,
  adminForcePromotionPaid,
  approvePromotionEstimate,
  cancelPromotion,
  createPromotionDraft,
  getPromotion,
  getPromotionForGym,
  listPromotionRecipients,
  listPromotionsByStatus,
  adminPromotionCounters,
  listPromotionsCreatedBy,
  listPromotionsForGym,
  listPromotionsWithGym,
  markPromotionPaid,
  ownerPromotionCounters,
  markPromotionRefunded,
  pricePromotion,
  promotionRecipientTally,
  rejectPromotion,
  replacePromotionRecipients,
  startPromotionSending,
  submitPromotion,
} from "./promotions";

let gymId = "";
let otherGymId = "";
let memberId = "";
const createdGymIds: string[] = [];

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_promo Main" })).id;
    otherGymId = (await createGym({ name: "test_promo Other" })).id;
    createdGymIds.push(gymId, otherGymId);
    memberId = (
      await createMember({
        gymId,
        name: "test_promo Member",
        phone: "9800000001",
        joinDate: "2026-01-01",
      })
    ).id;
  });
  afterAll(async () => {
    for (const id of createdGymIds) {
      const promoRows = await db
        .select({ id: promotions.id })
        .from(promotions)
        .where(eq(promotions.gymId, id));
      for (const p of promoRows) {
        await db
          .delete(promotionRecipients)
          .where(eq(promotionRecipients.promotionId, p.id));
      }
      await db.delete(promotions).where(eq(promotions.gymId, id));
    }
    await db.delete(members).where(like(members.name, "test_promo %"));
    await db.delete(gyms).where(like(gyms.name, "test_promo %"));
    await closeDb();
  });
}

dbSuite("createPromotionDraft", () => {
  it("derives the part flags from the content — text only", async () => {
    const p = await createPromotionDraft({ gymId, body: "  New Year offer  " });
    expect(p.status).toBe("draft");
    expect(p.settlement).toBe("none");
    expect(p.hasText).toBe(true);
    expect(p.hasImage).toBe(false);
    expect(p.body).toBe("New Year offer");
    expect(p.recipientCount).toBe(0);
    expect(p.perMessagePaise).toBeNull();
  });

  it("derives the part flags — image only, and drops mime with no image", async () => {
    const img = await createPromotionDraft({
      gymId,
      imageBytes: Buffer.from([1, 2, 3, 4]),
      imageMime: "image/jpeg",
    });
    expect(img.hasText).toBe(false);
    expect(img.hasImage).toBe(true);
    expect(img.imageMime).toBe("image/jpeg");

    const textOnly = await createPromotionDraft({
      gymId,
      body: "hi",
      imageMime: "image/png",
    });
    expect(textOnly.hasImage).toBe(false);
    expect(textOnly.imageMime).toBeNull();
  });

  it("rejects a promotion with neither a message nor an image", async () => {
    await expect(createPromotionDraft({ gymId })).rejects.toBeInstanceOf(
      PromotionError,
    );
  });

  it("read queries never carry image_bytes", async () => {
    const img = await createPromotionDraft({
      gymId,
      imageBytes: Buffer.from([5, 5, 5, 5]),
      imageMime: "image/png",
    });
    expect(img).not.toHaveProperty("imageBytes");

    const got = await getPromotion(img.id);
    expect(got).not.toHaveProperty("imageBytes");
    expect(got?.hasImage).toBe(true);

    const listed = (await listPromotionsForGym(gymId)).find((p) => p.id === img.id);
    expect(listed).toBeDefined();
    expect(listed).not.toHaveProperty("imageBytes");
  });
});

dbSuite("lookup + listing", () => {
  it("getPromotionForGym is gym-scoped", async () => {
    const p = await createPromotionDraft({ gymId, body: "scoped" });
    expect((await getPromotion(p.id))?.id).toBe(p.id);
    expect((await getPromotionForGym(gymId, p.id))?.id).toBe(p.id);
    expect(await getPromotionForGym(otherGymId, p.id)).toBeNull();
  });

  it("listPromotionsForGym only returns that gym's rows, newest first", async () => {
    await createPromotionDraft({ gymId, body: "a" });
    await createPromotionDraft({ gymId, body: "b" });
    const mine = await listPromotionsForGym(gymId);
    const other = await listPromotionsForGym(otherGymId);
    expect(mine.every((p) => p.gymId === gymId)).toBe(true);
    expect(other.every((p) => p.gymId === otherGymId)).toBe(true);
    const times = mine.map((p) => p.createdAt);
    expect([...times].sort((x, y) => (x < y ? 1 : -1))).toEqual(times);
  });

  it("listPromotionsByStatus filters across gyms", async () => {
    const drafts = await listPromotionsByStatus("draft");
    expect(drafts.some((p) => p.gymId === gymId)).toBe(true);
    expect(await listPromotionsByStatus([])).toEqual([]);
    expect(await listPromotionsByStatus("sent")).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ gymId })]),
    );
  });
});

dbSuite("replacePromotionRecipients", () => {
  it("dedupes by phone, sets recipient_count, and marks absent parts n/a", async () => {
    const p = await createPromotionDraft({ gymId, body: "text only promo" });
    const n = await replacePromotionRecipients(p.id, [
      { phone: "+919800000001", memberId, source: "member" },
      { phone: "+919800000002", source: "contact" },
      { phone: "+919800000002", source: "contact" }, // dupe dropped
      { phone: "  ", source: "contact" }, // blank dropped
    ]);
    expect(n).toBe(2);

    const after = await getPromotion(p.id);
    expect(after?.recipientCount).toBe(2);

    const recips = await listPromotionRecipients(p.id);
    expect(recips).toHaveLength(2);
    expect(recips.every((r) => r.textStatus === "pending")).toBe(true);
    expect(recips.every((r) => r.imageStatus === "n/a")).toBe(true);
    expect(recips.every((r) => r.attempts === 0)).toBe(true);
    expect(recips.find((r) => r.phone === "+919800000001")?.source).toBe("member");
    expect(recips.find((r) => r.phone === "+919800000001")?.memberId).toBe(memberId);
  });

  it("replaces the list wholesale on a second call", async () => {
    const p = await createPromotionDraft({
      gymId,
      imageBytes: Buffer.from([1, 2, 3, 4]),
      imageMime: "image/png",
    });
    await replacePromotionRecipients(p.id, [
      { phone: "+919811111111", source: "contact" },
    ]);
    await replacePromotionRecipients(p.id, [
      { phone: "+919822222222", source: "contact" },
      { phone: "+919833333333", source: "contact" },
    ]);
    const recips = await listPromotionRecipients(p.id);
    expect(recips.map((r) => r.phone).sort()).toEqual([
      "+919822222222",
      "+919833333333",
    ]);
    // image-only promotion → text part is n/a, image part pending
    expect(recips.every((r) => r.textStatus === "n/a")).toBe(true);
    expect(recips.every((r) => r.imageStatus === "pending")).toBe(true);
    expect((await getPromotion(p.id))?.recipientCount).toBe(2);
  });

  it("throws for an unknown promotion", async () => {
    await expect(
      replacePromotionRecipients("00000000-0000-0000-0000-000000000000", []),
    ).rejects.toBeInstanceOf(PromotionError);
  });
});

dbSuite("state transitions", () => {
  async function draftWithRecipient() {
    const p = await createPromotionDraft({ gymId, body: "transition test" });
    await replacePromotionRecipients(p.id, [
      { phone: "+919700000010", source: "contact" },
    ]);
    return p.id;
  }

  it("submitPromotion needs content + a recipient and only fires once", async () => {
    const empty = await createPromotionDraft({ gymId, body: "no recipients" });
    await expect(
      submitPromotion({ gymId, promotionId: empty.id }),
    ).rejects.toThrow(/recipient/i);

    const id = await draftWithRecipient();
    const submitted = await submitPromotion({ gymId, promotionId: id });
    expect(submitted.status).toBe("submitted");
    expect(submitted.submittedAt).not.toBeNull();

    await expect(
      submitPromotion({ gymId, promotionId: id }),
    ).rejects.toThrow(/already been submitted/);

    // wrong gym cannot see it
    await expect(
      submitPromotion({ gymId: otherGymId, promotionId: id }),
    ).rejects.toThrow(/no longer exists/);
  });

  it("approvePromotionEstimate only works from priced, then prepaid ack sets the amount", async () => {
    const id = await draftWithRecipient();
    await submitPromotion({ gymId, promotionId: id });

    // not priced yet
    await expect(
      approvePromotionEstimate({ gymId, promotionId: id }),
    ).rejects.toThrow(/not waiting/i);

    // admin pricing (F.5) simulated directly
    await db
      .update(promotions)
      .set({
        status: "priced",
        perMessagePaise: 50,
        estimatedTotalPaise: 50,
        pricedAt: new Date(),
      })
      .where(eq(promotions.id, id));

    const approved = await approvePromotionEstimate({ gymId, promotionId: id });
    expect(approved.status).toBe("approved");

    const acked = await acknowledgePromotionPrepaid({ gymId, promotionId: id });
    expect(acked.status).toBe("approved");
    expect(acked.prepaidPaise).toBe(50);

    // a second approve is now rejected
    await expect(
      approvePromotionEstimate({ gymId, promotionId: id }),
    ).rejects.toThrow(/not waiting/i);
  });

  it("cancelPromotion works pre-payment and is blocked once paid", async () => {
    const id = await draftWithRecipient();
    const cancelled = await cancelPromotion({ gymId, promotionId: id });
    expect(cancelled.status).toBe("cancelled");

    const id2 = await draftWithRecipient();
    await db
      .update(promotions)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(promotions.id, id2));
    await expect(
      cancelPromotion({ gymId, promotionId: id2 }),
    ).rejects.toThrow(/no longer be cancelled/);
  });

  it("listPromotionsCreatedBy and promotionRecipientTally", async () => {
    const p = await createPromotionDraft({
      gymId,
      createdByUserId: null,
      body: "tally",
    });
    await replacePromotionRecipients(p.id, [
      { phone: "+919700000021", source: "contact" },
      { phone: "+919700000022", source: "contact" },
    ]);
    await db
      .update(promotionRecipients)
      .set({ textStatus: "sent" })
      .where(eq(promotionRecipients.promotionId, p.id));

    const tally = await promotionRecipientTally(p.id);
    expect(tally.total).toBe(2);
    expect(tally.textSent).toBe(2);
    expect(tally.deliveredParts).toBe(2);

    // created_by null → not in a user's list; no throw
    expect(await listPromotionsCreatedBy(gymId, "someone")).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: p.id })]),
    );
  });
});

dbSuite("admin transitions", () => {
  async function submitted(body = "admin flow", perImage = false) {
    const p = await createPromotionDraft({
      gymId,
      body,
      imageBytes: perImage ? Buffer.from([1, 2, 3, 4]) : null,
      imageMime: perImage ? "image/png" : null,
    });
    await replacePromotionRecipients(p.id, [
      { phone: "+919700000030", source: "contact" },
      { phone: "+919700000031", source: "contact" },
    ]);
    await submitPromotion({ gymId, promotionId: p.id });
    return p.id;
  }

  it("pricePromotion computes the estimate and only fires from submitted", async () => {
    const id = await submitted("price me", true); // text + image → 2 parts
    const priced = await pricePromotion({ promotionId: id, perMessagePaise: 40 });
    expect(priced.status).toBe("priced");
    expect(priced.perMessagePaise).toBe(40);
    // 40 × 2 parts × 2 recipients
    expect(priced.estimatedTotalPaise).toBe(160);

    await expect(
      pricePromotion({ promotionId: id, perMessagePaise: 40 }),
    ).rejects.toThrow(/submitted/i);
  });

  it("send is blocked until paid; the full happy path reaches sending", async () => {
    const id = await submitted();
    await pricePromotion({ promotionId: id, perMessagePaise: 30 });

    await expect(
      startPromotionSending({ promotionId: id }),
    ).rejects.toThrow(/only be sent once it is paid/i);

    await approvePromotionEstimate({ gymId, promotionId: id });

    // paid requires the owner's prepaid acknowledgement first
    await expect(
      markPromotionPaid({ promotionId: id }),
    ).rejects.toThrow(/prepaid/i);

    await acknowledgePromotionPrepaid({ gymId, promotionId: id });
    const paid = await markPromotionPaid({ promotionId: id });
    expect(paid.status).toBe("paid");

    const sending = await startPromotionSending({ promotionId: id });
    expect(sending.status).toBe("sending");
  });

  it("adminForcePromotionPaid walks priced → paid, only from priced (CR-11)", async () => {
    const id = await submitted();

    await expect(
      adminForcePromotionPaid({ promotionId: id }),
    ).rejects.toThrow(/priced/i);

    await pricePromotion({ promotionId: id, perMessagePaise: 25 });
    const paid = await adminForcePromotionPaid({ promotionId: id });
    expect(paid.status).toBe("paid");
    expect(paid.prepaidPaise).toBe(paid.estimatedTotalPaise);
    expect(paid.approvedAt).not.toBeNull();
    expect(paid.paidAt).not.toBeNull();

    // stale button — status already moved on
    await expect(
      adminForcePromotionPaid({ promotionId: id }),
    ).rejects.toThrow(/priced/i);

    // the engine can pick it straight up
    const sending = await startPromotionSending({ promotionId: id });
    expect(sending.status).toBe("sending");
  });

  it("rejectPromotion works pre-payment and records the note", async () => {
    const id = await submitted();
    const rejected = await rejectPromotion({
      promotionId: id,
      adminNote: "Content not allowed",
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.adminNote).toBe("Content not allowed");
  });

  it("markPromotionRefunded needs an outstanding refund", async () => {
    const id = await submitted();
    await expect(
      markPromotionRefunded({ promotionId: id }),
    ).rejects.toThrow(/no refund outstanding/i);

    await db
      .update(promotions)
      .set({
        status: "partly_failed",
        settlement: "refund_due",
        billedTotalPaise: 30,
        refundPaise: 30,
        prepaidPaise: 60,
      })
      .where(eq(promotions.id, id));

    const refunded = await markPromotionRefunded({ promotionId: id });
    expect(refunded.settlement).toBe("refunded");
  });

  it("listPromotionsWithGym carries the gym name and filters by status", async () => {
    const id = await submitted();
    const all = await listPromotionsWithGym();
    const row = all.find((p) => p.id === id);
    expect(row?.gymName).toMatch(/^test_promo /);

    const filtered = await listPromotionsWithGym(["submitted"]);
    expect(filtered.every((p) => p.status === "submitted")).toBe(true);
    expect(filtered.some((p) => p.id === id)).toBe(true);
  });
});

dbSuite("overview counters", () => {
  it("ownerPromotionCounters buckets by who is blocking", async () => {
    const g = (await createGym({ name: "test_promo Counters" })).id;
    createdGymIds.push(g);

    async function submittedIn(): Promise<string> {
      const p = await createPromotionDraft({ gymId: g, body: "x" });
      await replacePromotionRecipients(p.id, [
        { phone: "+919700000040", source: "contact" },
      ]);
      await submitPromotion({ gymId: g, promotionId: p.id });
      return p.id;
    }

    const a = await submittedIn(); // stays submitted → withAdmin
    const b = await submittedIn();
    await pricePromotion({ promotionId: b, perMessagePaise: 10 }); // priced → needsOwnerAction

    const counters = await ownerPromotionCounters(g);
    expect(counters.inFlight).toBe(2);
    expect(counters.withAdmin).toBe(1);
    expect(counters.needsOwnerAction).toBe(1);
    expect(counters.sending).toBe(0);
    expect(counters.refundDue).toBe(0);
    void a;

    // a global counter includes our submitted one
    const admin = await adminPromotionCounters();
    expect(admin.submitted).toBeGreaterThanOrEqual(1);
    expect(admin.needsAdminAction).toBeGreaterThanOrEqual(1);
  });
});
