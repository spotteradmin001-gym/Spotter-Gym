import QRCode from "qrcode";

import { getGym } from "@/db/queries";
import { appUrl } from "@/lib/app-url";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";
import { currentCheckinToken } from "@/src/features/checkin/token";

export const dynamic = "force-dynamic";

/** PNG QR for the gym's check-in URL, with a fresh rotating token. Owner only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ gymSlug: string }> },
) {
  const { gymId } = await requireOwnerGym();
  const { gymSlug } = await params;

  const gym = await getGym(gymId);
  if (!gym || gym.slug !== gymSlug) {
    return new Response("Not found", { status: 404 });
  }

  const token = currentCheckinToken(gym.id);
  const url = `${appUrl()}/c/${gym.slug}?t=${token}`;
  const png = await QRCode.toBuffer(url, { width: 320, margin: 1 });

  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
    },
  });
}
