import { NextResponse } from "next/server";

import { planRemindersForAllGyms } from "@/db/queries";
import { isAuthorizedCron } from "@/lib/cron";
import { purgeStaleePromoImages } from "@/lib/promo-media";

export const dynamic = "force-dynamic";

/**
 * Daily, after dues generation: ensure a pre_due + on_due reminder job per
 * pending due (idempotent), then purge any stale promo image bytes the engine
 * did not clean up (best-effort — a failure here never fails the cron).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await planRemindersForAllGyms();

  let purgedPromoImages = 0;
  try {
    purgedPromoImages = await purgeStaleePromoImages();
  } catch {
    // best-effort backstop; the engine deletes images inline on terminal status
  }

  return NextResponse.json({ ok: true, ...result, purgedPromoImages });
}
