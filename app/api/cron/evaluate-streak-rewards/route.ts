import { NextResponse } from "next/server";

import { runStreakRewardsForAllGyms } from "@/db/queries";
import { isAuthorizedCron } from "@/lib/cron";

export const dynamic = "force-dynamic";

/**
 * Daily: score each active member's most-recently-closed billing cycle for the
 * attendance streak reward (CR-9 / 9d) and apply any pending N+2 credit to a
 * matching pending due. Idempotent — safe to run late or twice. Fully inert for
 * gyms with `streak_reward_percent = 0`. Scheduled in vercel.json.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runStreakRewardsForAllGyms();
  return NextResponse.json({ ok: true, ...result });
}
