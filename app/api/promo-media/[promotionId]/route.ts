import { NextResponse } from "next/server";

import {
  deletePromoImage,
  fetchPromoImage,
  isAuthorizedPromoMedia,
  isPromoMediaSecretSet,
} from "@/lib/promo-media";

export const dynamic = "force-dynamic";

/**
 * Promo-image bytes for the local WAHA engine (Phase F / CR-10, storage
 * reworked in R.4). Bearer-authed with `PROMO_MEDIA_SECRET`, the same shape as
 * the cron endpoints.
 *
 *   - secret unset            → 503 (the engine then sends text-only)
 *   - wrong / missing bearer  → 401
 *   - no stored image         → 404 (never set, deleted after sending, purged)
 *
 * `GET` streams the bytes; `DELETE` drops them once the engine is done with the
 * promotion.
 */
function authGate(request: Request): NextResponse | null {
  if (!isPromoMediaSecretSet()) {
    return NextResponse.json(
      { error: "Promo media is not configured." },
      { status: 503 },
    );
  }
  if (!isAuthorizedPromoMedia(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ promotionId: string }> },
) {
  const blocked = authGate(request);
  if (blocked) return blocked;

  const { promotionId } = await params;
  const image = await fetchPromoImage(promotionId);
  if (!image) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "content-type": image.mime,
      "content-length": String(image.bytes.byteLength),
      "cache-control": "no-store",
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ promotionId: string }> },
) {
  const blocked = authGate(request);
  if (blocked) return blocked;

  const { promotionId } = await params;
  await deletePromoImage(promotionId);
  return new Response(null, { status: 204 });
}
