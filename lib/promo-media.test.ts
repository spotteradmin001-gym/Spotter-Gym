/**
 * `assertValidPromoImage` + the config guards are pure and always run. The
 * storage lifecycle (`uploadPromoImage` / `fetchPromoImage` / `deletePromoImage`
 * / `purgeStaleePromoImages`) hits the Neon `preview` branch and is skipped when
 * DATABASE_URL is unset. FIND-MY-FIXTURE: gym name `test_media %`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, db } from "@/db/client";
import { createGym } from "@/db/queries";
import { gyms, promotions } from "@/db/schema";

import {
  assertValidPromoImage,
  deletePromoImage,
  fetchPromoImage,
  isAuthorizedPromoMedia,
  isPromoMediaEnabled,
  isPromoMediaSecretSet,
  MAX_PROMO_IMAGE_BYTES,
  PromoMediaError,
  purgeStaleePromoImages,
  uploadPromoImage,
} from "./promo-media";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

describe("configuration guards", () => {
  const savedDb = process.env.DATABASE_URL;
  const savedSecret = process.env.PROMO_MEDIA_SECRET;

  afterEach(() => {
    if (savedDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedDb;
    if (savedSecret === undefined) delete process.env.PROMO_MEDIA_SECRET;
    else process.env.PROMO_MEDIA_SECRET = savedSecret;
  });

  it("isPromoMediaEnabled tracks whether the app has a database", () => {
    process.env.DATABASE_URL = "postgres://x";
    expect(isPromoMediaEnabled()).toBe(true);
    delete process.env.DATABASE_URL;
    expect(isPromoMediaEnabled()).toBe(false);
  });

  it("isPromoMediaSecretSet + isAuthorizedPromoMedia gate on the bearer secret", () => {
    const req = (auth?: string) =>
      new Request("https://x/api/promo-media/p1", {
        headers: auth ? { authorization: auth } : {},
      });

    delete process.env.PROMO_MEDIA_SECRET;
    expect(isPromoMediaSecretSet()).toBe(false);
    expect(isAuthorizedPromoMedia(req("Bearer whatever"))).toBe(false);

    process.env.PROMO_MEDIA_SECRET = "s3cr3t";
    expect(isPromoMediaSecretSet()).toBe(true);
    expect(isAuthorizedPromoMedia(req("Bearer s3cr3t"))).toBe(true);
    expect(isAuthorizedPromoMedia(req("Bearer wrong"))).toBe(false);
    expect(isAuthorizedPromoMedia(req())).toBe(false);
  });
});

describe("assertValidPromoImage", () => {
  const ok = new Uint8Array([1, 2, 3, 4]);

  it("accepts a small JPEG/PNG/WebP", () => {
    expect(() => assertValidPromoImage(ok, "image/jpeg")).not.toThrow();
    expect(() => assertValidPromoImage(ok, "IMAGE/PNG")).not.toThrow();
    expect(() => assertValidPromoImage(ok, "image/webp")).not.toThrow();
  });

  it("rejects a non-image mime, an empty file and an oversize file", () => {
    expect(() => assertValidPromoImage(ok, "application/pdf")).toThrow(
      PromoMediaError,
    );
    expect(() => assertValidPromoImage(ok, "image/gif")).toThrow(PromoMediaError);
    expect(() => assertValidPromoImage(new Uint8Array(0), "image/png")).toThrow(
      /empty/,
    );
    expect(() =>
      assertValidPromoImage(new Uint8Array(MAX_PROMO_IMAGE_BYTES + 1), "image/png"),
    ).toThrow(/5 MB/);
  });
});

let gymId = "";

async function newPromotion(overrides: Partial<typeof promotions.$inferInsert> = {}) {
  const [row] = await db
    .insert(promotions)
    .values({ gymId, hasImage: true, ...overrides })
    .returning({ id: promotions.id });
  return row!.id;
}

if (process.env.DATABASE_URL) {
  beforeEach(async () => {
    if (!gymId) {
      gymId = (await createGym({ name: `test_media ${Date.now()}` })).id;
    }
  });
  afterAll(async () => {
    if (gymId) {
      await db.delete(promotions).where(eq(promotions.gymId, gymId));
    }
    await db.delete(gyms).where(like(gyms.name, "test_media %"));
    await closeDb();
  });
}

dbSuite("promo image storage lifecycle", () => {
  const bytes = new Uint8Array([9, 8, 7, 6, 5]);

  it("upload → fetch → delete, then fetch is null and has_image stays true", async () => {
    const id = await newPromotion();

    await uploadPromoImage(id, bytes, "image/png");
    const got = await fetchPromoImage(id);
    expect(got).not.toBeNull();
    expect([...got!.bytes]).toEqual([...bytes]);
    expect(got!.mime).toBe("image/png");

    const [afterUpload] = await db
      .select({
        hasImage: promotions.hasImage,
        storedAt: promotions.imageStoredAt,
        deletedAt: promotions.imageDeletedAt,
      })
      .from(promotions)
      .where(eq(promotions.id, id));
    expect(afterUpload!.hasImage).toBe(true);
    expect(afterUpload!.storedAt).not.toBeNull();
    expect(afterUpload!.deletedAt).toBeNull();

    await deletePromoImage(id);
    expect(await fetchPromoImage(id)).toBeNull();

    const [afterDelete] = await db
      .select({
        hasImage: promotions.hasImage,
        bytes: promotions.imageBytes,
        deletedAt: promotions.imageDeletedAt,
      })
      .from(promotions)
      .where(eq(promotions.id, id));
    expect(afterDelete!.hasImage).toBe(true); // history still shows an image
    expect(afterDelete!.bytes).toBeNull();
    expect(afterDelete!.deletedAt).not.toBeNull();

    await expect(deletePromoImage(id)).resolves.toBeUndefined(); // idempotent
  });

  it("rejects an invalid image and a missing promotion", async () => {
    const id = await newPromotion();
    await expect(uploadPromoImage(id, bytes, "image/gif")).rejects.toBeInstanceOf(
      PromoMediaError,
    );
    await expect(
      uploadPromoImage("does-not-exist", bytes, "image/png"),
    ).rejects.toThrow(/no longer exists/);
  });

  it("purgeStaleePromoImages only touches terminal, old, non-null rows", async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 60 * 1000);

    const oldSent = await newPromotion({ status: "sent", sentAt: old });
    const oldCancelled = await newPromotion({ status: "cancelled", updatedAt: old });
    const recentSent = await newPromotion({ status: "sent", sentAt: recent });
    const oldSending = await newPromotion({ status: "sending", updatedAt: old });
    for (const id of [oldSent, oldCancelled, recentSent, oldSending]) {
      await uploadPromoImage(id, bytes, "image/png");
    }
    // updatedAt is bumped by uploadPromoImage — reset the ones the case needs old.
    await db
      .update(promotions)
      .set({ updatedAt: old })
      .where(eq(promotions.id, oldCancelled));
    await db
      .update(promotions)
      .set({ updatedAt: old })
      .where(eq(promotions.id, oldSending));

    const purged = await purgeStaleePromoImages();
    expect(purged).toBeGreaterThanOrEqual(2);

    expect(await fetchPromoImage(oldSent)).toBeNull();
    expect(await fetchPromoImage(oldCancelled)).toBeNull();
    expect(await fetchPromoImage(recentSent)).not.toBeNull(); // too recent
    expect(await fetchPromoImage(oldSending)).not.toBeNull(); // not terminal
  });
});
