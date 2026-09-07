import { NextResponse } from "next/server";

import { generateDuesForAllGyms } from "@/db/queries";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * Daily: ensure every active member of every active gym has a `dues` row for
 * the current and next billing period. Idempotent, so running late (or twice)
 * is harmless. Scheduled in vercel.json.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await generateDuesForAllGyms();
  return NextResponse.json({ ok: true, ...result });
}
