import { NextResponse } from "next/server";

import { materializeRecurringForAllGyms } from "@/db/queries";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

/** Monthly: turn each active recurring expense into an `expenses` row for the current month. Idempotent. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await materializeRecurringForAllGyms();
  return NextResponse.json({ ok: true, ...result });
}
