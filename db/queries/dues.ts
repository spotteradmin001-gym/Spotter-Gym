import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { dues, gyms, members } from "@/db/schema";
import { duePeriodsFor } from "@/lib/billing";

import { resolveFeePaise } from "./members";

export type DueStatus = "pending" | "paid" | "waived";

export type Due = {
  id: string;
  memberId: string;
  gymId: string;
  periodMonth: string;
  amountDuePaise: number;
  dueDate: string;
  status: DueStatus;
  createdAt: string;
};

function mapDue(row: typeof dues.$inferSelect): Due {
  return {
    id: row.id,
    memberId: row.memberId,
    gymId: row.gymId,
    periodMonth: row.periodMonth,
    amountDuePaise: row.amountDuePaise,
    dueDate: row.dueDate,
    status: row.status as DueStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Ensures the current and next billing period's `dues` row exists for every
 * active member of a gym. Idempotent (unique on member+period), skips inactive
 * members, never prorates a partial first month. Returns how many rows were
 * created.
 */
export async function generateDuesForGym(
  gymId: string,
  asOf: Date = new Date(),
): Promise<{ created: number }> {
  const [gym] = await db
    .select({
      anchorMode: gyms.billingAnchorMode,
      anchorDay: gyms.billingAnchorDay,
      defaultFee: gyms.defaultMonthlyFeePaise,
    })
    .from(gyms)
    .where(eq(gyms.id, gymId))
    .limit(1);
  if (!gym) return { created: 0 };

  const activeMembers = await db
    .select()
    .from(members)
    .where(and(eq(members.gymId, gymId), eq(members.status, "active")));

  const rows: (typeof dues.$inferInsert)[] = [];
  for (const member of activeMembers) {
    const anchorDay =
      gym.anchorMode === "fixed" ? gym.anchorDay : member.billingAnchorDay;
    const amount = resolveFeePaise(member.monthlyFeePaise ?? null, gym.defaultFee ?? null);

    for (const period of duePeriodsFor({
      asOf,
      joinDate: member.joinDate,
      anchorDay,
    })) {
      rows.push({
        memberId: member.id,
        gymId,
        periodMonth: period.periodMonth,
        dueDate: period.dueDate,
        amountDuePaise: amount,
        status: "pending",
      });
    }
  }

  if (rows.length === 0) return { created: 0 };

  const inserted = await db
    .insert(dues)
    .values(rows)
    .onConflictDoNothing({ target: [dues.memberId, dues.periodMonth] })
    .returning({ id: dues.id });

  return { created: inserted.length };
}

/** Runs the generator for every active gym — used by the daily cron. */
export async function generateDuesForAllGyms(
  asOf: Date = new Date(),
): Promise<{ gyms: number; created: number }> {
  const active = await db
    .select({ id: gyms.id })
    .from(gyms)
    .where(eq(gyms.isActive, true));

  let created = 0;
  for (const gym of active) {
    created += (await generateDuesForGym(gym.id, asOf)).created;
  }
  return { gyms: active.length, created };
}

export async function listDuesForMember(
  gymId: string,
  memberId: string,
): Promise<Due[]> {
  const rows = await db
    .select()
    .from(dues)
    .where(and(eq(dues.gymId, gymId), eq(dues.memberId, memberId)))
    .orderBy(desc(dues.periodMonth));
  return rows.map(mapDue);
}

export async function listDuesForGym(
  gymId: string,
  opts: { status?: DueStatus } = {},
): Promise<Due[]> {
  const where = [eq(dues.gymId, gymId)];
  if (opts.status) where.push(eq(dues.status, opts.status));
  const rows = await db
    .select()
    .from(dues)
    .where(and(...where))
    .orderBy(asc(dues.dueDate));
  return rows.map(mapDue);
}
