import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { gyms, wahaSendLog } from "@/db/schema";

export type SendKind = "reminder" | "activation" | "promo";

const TRANSACTIONAL_KINDS: SendKind[] = ["reminder", "activation"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Add `count` to a gym's tally for `kind` on `sentOn` (default today), creating
 * the row on first send that day. The engine calls this after each successful
 * WAHA send so the promo-budget maths stays current.
 */
export async function recordWahaSends(input: {
  gymId: string;
  kind: SendKind;
  count?: number;
  sentOn?: string;
}): Promise<void> {
  const count = input.count ?? 1;
  if (count <= 0) return;
  const sentOn = input.sentOn ?? today();

  await db
    .insert(wahaSendLog)
    .values({ gymId: input.gymId, kind: input.kind, sentOn, count })
    .onConflictDoUpdate({
      target: [wahaSendLog.gymId, wahaSendLog.sentOn, wahaSendLog.kind],
      set: {
        count: sql`${wahaSendLog.count} + ${count}`,
        updatedAt: new Date(),
      },
    });
}

export type DaySendCounts = {
  reminder: number;
  activation: number;
  promo: number;
  /** reminder + activation — the traffic the promo budget subtracts. */
  transactional: number;
};

export async function getSendCountsForDay(
  gymId: string,
  sentOn: string = today(),
): Promise<DaySendCounts> {
  const rows = await db
    .select({ kind: wahaSendLog.kind, count: wahaSendLog.count })
    .from(wahaSendLog)
    .where(and(eq(wahaSendLog.gymId, gymId), eq(wahaSendLog.sentOn, sentOn)));

  const out: DaySendCounts = {
    reminder: 0,
    activation: 0,
    promo: 0,
    transactional: 0,
  };
  for (const r of rows) {
    if (r.kind === "reminder") out.reminder = r.count;
    else if (r.kind === "activation") out.activation = r.count;
    else if (r.kind === "promo") out.promo = r.count;
  }
  out.transactional = out.reminder + out.activation;
  return out;
}

export type PromoBudget = {
  dailyCap: number;
  reserve: number;
  transactionalToday: number;
  promoSentToday: number;
  /** cap - reserve - transactional sends already made today, floored at 0. */
  remaining: number;
};

/**
 * How many promo messages this gym may still send today:
 * `waha_daily_cap - transactional_reserve - today's transactional sends`,
 * floored at zero. Reminders and activation always take priority — that is
 * what the reserve protects.
 */
export async function promoBudgetForDay(
  gymId: string,
  sentOn: string = today(),
): Promise<PromoBudget> {
  const [gym] = await db
    .select({
      dailyCap: gyms.wahaDailyCap,
      reserve: gyms.transactionalReserve,
    })
    .from(gyms)
    .where(eq(gyms.id, gymId))
    .limit(1);
  const dailyCap = gym?.dailyCap ?? 0;
  const reserve = gym?.reserve ?? 0;

  const counts = await getSendCountsForDay(gymId, sentOn);
  const remaining = Math.max(0, dailyCap - reserve - counts.transactional);

  return {
    dailyCap,
    reserve,
    transactionalToday: counts.transactional,
    promoSentToday: counts.promo,
    remaining,
  };
}

export { TRANSACTIONAL_KINDS };
