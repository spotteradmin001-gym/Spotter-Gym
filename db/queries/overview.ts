import "server-only";

import { and, count, countDistinct, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { dues, members } from "@/db/schema";
import { addMonths, periodMonthOf } from "@/lib/billing";

import { paymentsSummary } from "./payments";
import { monthlyPnl } from "./pnl";

export type MemberStats = {
  activeTotal: number;
  /** All members who joined in the window, active or not — a growth metric. */
  joinedThisMonth: number;
  joinedLast3Months: number;
  /**
   * "Not renewed": still an active member, had a due whose date has passed, and
   * it's still unpaid. Scoped to the month / last 3 months by the due's period.
   * (Open question #3, locked here.)
   */
  notRenewedThisMonth: number;
  notRenewedLast3Months: number;
};

export type OwnerOverview = {
  monthProfitPaise: number;
  outstandingPaise: number;
  dueTodayPaise: number;
  members: MemberStats;
};

export async function ownerOverview(
  gymId: string,
  asOf: Date = new Date(),
): Promise<OwnerOverview> {
  const today = asOf.toISOString().slice(0, 10);
  const monthStart = periodMonthOf(asOf);
  const threeMonthsStart = addMonths(monthStart, -2);

  const [pnl, summary] = await Promise.all([
    monthlyPnl(gymId, { months: 1, asOf }),
    paymentsSummary(gymId, { period: "month", asOf }),
  ]);

  const [
    [activeTotal],
    [joinedThisMonth],
    [joinedLast3Months],
    [notRenewedThisMonth],
    [notRenewedLast3Months],
  ] = await Promise.all([
    db
      .select({ v: count() })
      .from(members)
      .where(and(eq(members.gymId, gymId), eq(members.status, "active"))),
    db
      .select({ v: count() })
      .from(members)
      .where(and(eq(members.gymId, gymId), gte(members.joinDate, monthStart))),
    db
      .select({ v: count() })
      .from(members)
      .where(
        and(eq(members.gymId, gymId), gte(members.joinDate, threeMonthsStart)),
      ),
    notRenewedCount(gymId, today, monthStart),
    notRenewedCount(gymId, today, threeMonthsStart),
  ]);

  return {
    monthProfitPaise: pnl[0]?.netPaise ?? 0,
    outstandingPaise: summary.outstandingPaise,
    dueTodayPaise: summary.dueTodayPaise,
    members: {
      activeTotal: activeTotal.v,
      joinedThisMonth: joinedThisMonth.v,
      joinedLast3Months: joinedLast3Months.v,
      notRenewedThisMonth: notRenewedThisMonth.v,
      notRenewedLast3Months: notRenewedLast3Months.v,
    },
  };
}

function notRenewedCount(gymId: string, today: string, periodFrom: string) {
  return db
    .select({ v: countDistinct(dues.memberId) })
    .from(dues)
    .innerJoin(members, eq(members.id, dues.memberId))
    .where(
      and(
        eq(dues.gymId, gymId),
        eq(dues.status, "pending"),
        lte(dues.dueDate, today),
        gte(dues.periodMonth, periodFrom),
        eq(members.status, "active"),
        sql`${members.gymId} = ${gymId}`,
      ),
    );
}
