import "server-only";

import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { promotions } from "@/db/schema";

/**
 * Promo-image storage for paid WhatsApp promotions (Phase F / CR-10, storage
 * reworked in R.4).
 *
 * The image lives inline in `promotions.image_bytes` (Postgres `bytea`) — no
 * Google account, no object store, near-zero standing footprint. It is
 * ephemeral: the local WAHA engine downloads it once through
 * `GET /api/promo-media/[promotionId]` (which calls `fetchPromoImage`),
 * base64-encodes it for WAHA, and `DELETE`s it (→ `deletePromoImage`) as soon
 * as the promotion reaches a terminal status. `purgeStalePromoImages` is a
 * daily backstop for anything the engine left behind.
 *
 * `PROMO_MEDIA_SECRET` unset → the media route returns 503 and the engine sends
 * text-only, marking the image part `skipped`.
 */

/** Hard upload ceiling so the base64 payload the engine sends to WAHA stays sane. */
export const MAX_PROMO_IMAGE_BYTES = 5 * 1024 * 1024;

/** Image types WhatsApp renders reliably as a photo. */
export const ALLOWED_PROMO_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Terminal promotion statuses — an image is safe to purge once here. */
const TERMINAL_PROMOTION_STATUS = [
  "sent",
  "partly_failed",
  "failed",
  "cancelled",
] as const;

/** How long a terminal promotion's image may linger before the daily purge. */
const PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export class PromoMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromoMediaError";
  }
}

/**
 * True when the feature is usable — i.e. the app can reach its database. There
 * is no external dependency any more; this stays a function so the compose flow
 * and its tests can gate on it the same way they gate on mail.
 */
export function isPromoMediaEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** True when the media route's shared secret is configured. */
export function isPromoMediaSecretSet(): boolean {
  return Boolean(process.env.PROMO_MEDIA_SECRET?.trim());
}

/**
 * Whether a request carries the correct `Authorization: Bearer <secret>` for
 * the media route. Returns false when the secret is unset — the route checks
 * `isPromoMediaSecretSet()` first and answers 503 in that case.
 */
export function isAuthorizedPromoMedia(request: Request): boolean {
  const secret = process.env.PROMO_MEDIA_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Validate a candidate promo image. Pure — no DB call — so the compose action
 * and its tests can use it directly. Throws `PromoMediaError` with user-facing
 * copy.
 */
export function assertValidPromoImage(bytes: Uint8Array, mime: string): void {
  const normalised = mime.trim().toLowerCase();
  if (!(ALLOWED_PROMO_IMAGE_MIME as readonly string[]).includes(normalised)) {
    throw new PromoMediaError("The image must be a JPEG, PNG or WebP file.");
  }
  if (bytes.byteLength === 0) {
    throw new PromoMediaError("That image file is empty.");
  }
  if (bytes.byteLength > MAX_PROMO_IMAGE_BYTES) {
    throw new PromoMediaError("The image must be 5 MB or smaller.");
  }
}

/**
 * Store image bytes on an existing promotion. Validates type + size first.
 * Sets `image_bytes` + `image_mime` + `image_stored_at = now()`, clears
 * `image_deleted_at`, and flips `has_image` true.
 */
export async function uploadPromoImage(
  promotionId: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  assertValidPromoImage(bytes, mime);

  const rows = await db
    .update(promotions)
    .set({
      imageBytes: Buffer.from(bytes),
      imageMime: mime.trim().toLowerCase(),
      imageStoredAt: new Date(),
      imageDeletedAt: null,
      hasImage: true,
      updatedAt: new Date(),
    })
    .where(eq(promotions.id, promotionId))
    .returning({ id: promotions.id });

  if (rows.length === 0) {
    throw new PromoMediaError("That promotion no longer exists.");
  }
}

export type PromoImageBytes = { bytes: Buffer; mime: string };

/**
 * The stored bytes for a promotion, or null when there is nothing to serve —
 * the image was deleted after sending, purged, or the promotion never had one.
 */
export async function fetchPromoImage(
  promotionId: string,
): Promise<PromoImageBytes | null> {
  const [row] = await db
    .select({ bytes: promotions.imageBytes, mime: promotions.imageMime })
    .from(promotions)
    .where(eq(promotions.id, promotionId))
    .limit(1);

  if (!row || !row.bytes || row.bytes.byteLength === 0) return null;
  return {
    bytes: Buffer.from(row.bytes),
    mime: row.mime || "application/octet-stream",
  };
}

/**
 * Drop a promotion's stored image: null `image_bytes`, stamp
 * `image_deleted_at`. `has_image` is left true so the UI / history still shows
 * the promotion carried an image. Idempotent — a second call is a no-op.
 */
export async function deletePromoImage(promotionId: string): Promise<void> {
  await db
    .update(promotions)
    .set({ imageBytes: null, imageDeletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(promotions.id, promotionId),
        isNotNull(promotions.imageBytes),
      ),
    );
}

/**
 * Daily backstop: null `image_bytes` for terminal promotions whose image the
 * engine did not clean up and that finished more than a week ago. Returns how
 * many rows were purged.
 */
export async function purgeStalePromoImages(
  asOf: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(asOf.getTime() - PURGE_AFTER_MS);

  const rows = await db
    .update(promotions)
    .set({ imageBytes: null, imageDeletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        inArray(promotions.status, [...TERMINAL_PROMOTION_STATUS]),
        isNotNull(promotions.imageBytes),
        lt(sql`coalesce(${promotions.sentAt}, ${promotions.updatedAt})`, cutoff),
      ),
    )
    .returning({ id: promotions.id });

  return rows.length;
}
