import { NextResponse } from "next/server";

import { getPromotion } from "@/db/queries";
import {
  fetchPromoImage,
  isAuthorizedPromoMedia,
  isPromoMediaSecretSet,
  PromoMediaError,
} from "@/lib/promo-media";

export const dynamic = "force-dynamic";

/**
 * Streams a promotion's image bytes from Google Drive to the local WAHA engine
 * (Phase F / CR-10). Bearer-authed with `PROMO_MEDIA_SECRET`, the same shape as
 * the cron endpoints.
 *
 *   - secret unset            → 503 (the engine then sends text-only)
 *   - wrong / missing bearer  → 401
 *   - unknown promotion / no image part → 404
 *   - Drive failure           → 502
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ promotionId: string }> },
) {
  if (!isPromoMediaSecretSet()) {
    return NextResponse.json(
      { error: "Promo media is not configured." },
      { status: 503 },
    );
  }
  if (!isAuthorizedPromoMedia(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { promotionId } = await params;
  const promotion = await getPromotion(promotionId);
  if (!promotion || !promotion.imageDriveFileId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { bytes, mime } = await fetchPromoImage(promotion.imageDriveFileId);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": promotion.imageMime || mime,
        "content-length": String(bytes.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof PromoMediaError
        ? error.message
        : "Could not fetch the image.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
