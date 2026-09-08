import { NextResponse } from "next/server";

import { planRemindersForAllGyms } from "@/db/queries";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

/** Daily, after dues generation: ensure a pre_due + on_due reminder job per pending due. Idempotent. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await planRemindersForAllGyms();
  return NextResponse.json({ ok: true, ...result });
}
