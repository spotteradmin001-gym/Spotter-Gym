import "server-only";

import { and, asc, desc, eq, gte, lt } from "drizzle-orm";

import { db } from "@/db/client";
import { checkins, dues, gyms, members, streakRewards } from "@/db/schema";
import {
  applyRewardDiscount,
  closedCycleWindow,
  qualifyStreakReward,
} from "@/lib/streak-reward";
import { addDays } from "@/lib/streak";

import { closedDates } from "./schedule";

export type StreakRewardStatus = "earned" | "applied" | "missed";

export type StreakReward = {
  id: string;
  memberId: string;
  gymId: string;
  /** Period-month `YYYY-MM-DD` of the cycle that was scored. */
  earnedPeriod: string;
  /** Period-month the credit redeems against (earned + 2 months). */
  redeemPeriod: string;
  percent: number;
  status: StreakRewardStatus;
  appliedDueId: string | null;
  createdAt: string;
};

function mapReward(row: typeof streakRewards.$inferSelect): StreakReward {
  return {
    id: row.id,
    memberId: row.memberId,
    gymId: row.gymId,
    earnedPeriod: row.earnedPeriod,
    redeemPeriod: row.redeemPeriod,
    percent: row.percent,
    status: row.status as StreakRewardStatus,
    appliedDueId: row.appliedDueId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadGymRewardConfig(gymId: string) {
  const [gym] = await db
    .select({
      percent: gyms.streakRewardPercent,
      buffer: gyms.streakAllowedMisses,
      anchorMode: gyms.billingAnchorMode,
      anchorDay: gyms.billingAnchorDay,
    })
    .from(gyms)
    .where(eq(gyms.id, gymId))
    .limit(1);
  return gym ?? null;
}

/**
 * Score every active member's most-recently-closed billing cycle for the gym.
 * Inserts an `earned` or `missed` `streak_rewards` row, idempotent on
 * `(member_id, earned_period)` so a re-run — or the cron overlapping dues
 * generation — is harmless.
 *
 * `streak_reward_percent = 0` → the whole feature is inert: no rows written.
 */
export async function evaluateStreakRewardsForGym(
  gymId: string,
  asOf: Date = new Date(),
): Promise<{ earned: number; missed: number }> {
  const gym = await loadGymRewardConfig(gymId);
  if (!gym || gym.percent <= 0) return { earned: 0, missed: 0 };

  const today = asOf.toISOString().slice(0, 10);
  const activeMembers = await db
    .select()
    .from(members)
    .where(and(eq(members.gymId, gymId), eq(members.status, "active")));

  let earned = 0;
  let missed = 0;
  for (const member of activeMembers) {
    const anchorDay =
      gym.anchorMode === "fixed" ? gym.anchorDay : member.billingAnchorDay;
    const window = closedCycleWindow(anchorDay, today);
    // Skip a partial first cycle — the member joined after it started.
    if (window.cycleStart < member.joinDate) continue;

    const [checkinRows, closed] = await Promise.all([
      db
        .select({ d: checkins.checkinDate })
        .from(checkins)
        .where(
          and(
            eq(checkins.memberId, member.id),
            gte(checkins.checkinDate, window.cycleStart),
            lt(checkins.checkinDate, window.cycleEnd),
          ),
        ),
      closedDates(gymId, window.cycleStart, addDays(window.cycleEnd, -1)),
    ]);

    const q = qualifyStreakReward({
      anchorDay,
      today,
      checkins: checkinRows.map((r) => r.d),
      closed,
      allowedMisses: gym.buffer,
    });
    const status: StreakRewardStatus = q.qualifies ? "earned" : "missed";

    const inserted = await db
      .insert(streakRewards)
      .values({
        memberId: member.id,
        gymId,
        earnedPeriod: q.earnedPeriod,
        redeemPeriod: q.redeemPeriod,
        percent: gym.percent,
        status,
      })
      .onConflictDoNothing({
        target: [streakRewards.memberId, streakRewards.earnedPeriod],
      })
      .returning({ id: streakRewards.id });

    if (inserted.length) {
      if (status === "earned") earned++;
      else missed++;
    }
  }
  return { earned, missed };
}

/**
 * Apply every pending (`earned`) credit to a member due: reduce the due by
 * `percent`, link `applied_due_id`, flip the reward to `applied`. The reward row
 * is the lock — flipped first with a status guard — so the discount lands
 * exactly once even under a concurrent run.
 *
 * Target due: the member's **oldest** `pending` due whose `period_month` is on
 * or after `redeem_period`. When the `redeem_period` due itself is still
 * `pending` that is the one picked; when it is already `paid`/`waived` or was
 * never generated, the credit slides forward to the next pending due. If the
 * member has no eligible pending due yet the reward stays `earned` and a later
 * run retries — so it slides forward automatically as new dues are generated.
 */
export async function applyDueStreakDiscounts(
  gymId: string,
): Promise<{ applied: number; discountedPaise: number }> {
  const gym = await loadGymRewardConfig(gymId);
  if (!gym || gym.percent <= 0) return { applied: 0, discountedPaise: 0 };

  const pending = await db
    .select()
    .from(streakRewards)
    .where(
      and(eq(streakRewards.gymId, gymId), eq(streakRewards.status, "earned")),
    );

  let applied = 0;
  let discountedPaise = 0;
  for (const reward of pending) {
    const [due] = await db
      .select()
      .from(dues)
      .where(
        and(
          eq(dues.memberId, reward.memberId),
          gte(dues.periodMonth, reward.redeemPeriod),
          eq(dues.status, "pending"),
        ),
      )
      .orderBy(asc(dues.periodMonth))
      .limit(1);
    if (!due) continue;

    const { discountPaise, netPaise } = applyRewardDiscount(
      due.amountDuePaise,
      reward.percent,
    );
    if (discountPaise <= 0) continue;

    const claimed = await db
      .update(streakRewards)
      .set({ status: "applied", appliedDueId: due.id })
      .where(
        and(
          eq(streakRewards.id, reward.id),
          eq(streakRewards.status, "earned"),
        ),
      )
      .returning({ id: streakRewards.id });
    if (!claimed.length) continue;

    await db
      .update(dues)
      .set({ amountDuePaise: netPaise, updatedAt: new Date() })
      .where(and(eq(dues.id, due.id), eq(dues.status, "pending")));

    applied++;
    discountedPaise += discountPaise;
  }
  return { applied, discountedPaise };
}

/** Evaluate + apply for every active gym — the daily cron entry point. */
export async function runStreakRewardsForAllGyms(
  asOf: Date = new Date(),
): Promise<{ gyms: number; earned: number; missed: number; applied: number }> {
  const active = await db
    .select({ id: gyms.id })
    .from(gyms)
    .where(eq(gyms.isActive, true));

  let earned = 0;
  let missed = 0;
  let applied = 0;
  for (const gym of active) {
    const e = await evaluateStreakRewardsForGym(gym.id, asOf);
    const a = await applyDueStreakDiscounts(gym.id);
    earned += e.earned;
    missed += e.missed;
    applied += a.applied;
  }
  return { gyms: active.length, earned, missed, applied };
}

export async function listStreakRewardsForMember(
  gymId: string,
  memberId: string,
): Promise<StreakReward[]> {
  const rows = await db
    .select()
    .from(streakRewards)
    .where(
      and(eq(streakRewards.gymId, gymId), eq(streakRewards.memberId, memberId)),
    )
    .orderBy(desc(streakRewards.earnedPeriod));
  return rows.map(mapReward);
}

/** Pending (`earned`, not yet applied) credits for the owner payments view. */
export async function listPendingStreakRewardsForGym(
  gymId: string,
): Promise<Array<StreakReward & { memberName: string }>> {
  const rows = await db
    .select({ reward: streakRewards, memberName: members.name })
    .from(streakRewards)
    .innerJoin(members, eq(members.id, streakRewards.memberId))
    .where(
      and(eq(streakRewards.gymId, gymId), eq(streakRewards.status, "earned")),
    )
    .orderBy(desc(streakRewards.redeemPeriod));
  return rows.map((r) => ({ ...mapReward(r.reward), memberName: r.memberName }));
}

export type ChestState = "off" | "locked" | "pending" | "earned" | "missed";

export type MemberRewardOverview = {
  /** The gym's configured reward percent (0 = feature off). */
  percent: number;
  chest: {
    state: ChestState;
    earnedPeriod: string | null;
    redeemPeriod: string | null;
    percent: number | null;
  };
  rewards: StreakReward[];
};

/**
 * Everything `/m` needs for the treasure chest and the pending-credit line.
 * When the gym's percent is 0 the chest state is `off` and callers render
 * nothing.
 */
export async function memberRewardOverview(
  gymId: string,
  memberId: string,
  asOf: Date = new Date(),
): Promise<MemberRewardOverview> {
  const gym = await loadGymRewardConfig(gymId);
  if (!gym || gym.percent <= 0) {
    return {
      percent: 0,
      chest: { state: "off", earnedPeriod: null, redeemPeriod: null, percent: null },
      rewards: [],
    };
  }

  const [member] = await db
    .select({
      joinDate: members.joinDate,
      anchorDay: members.billingAnchorDay,
    })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.gymId, gymId)))
    .limit(1);
  if (!member) {
    return {
      percent: gym.percent,
      chest: { state: "locked", earnedPeriod: null, redeemPeriod: null, percent: null },
      rewards: [],
    };
  }

  const today = asOf.toISOString().slice(0, 10);
  const anchorDay =
    gym.anchorMode === "fixed" ? gym.anchorDay : member.anchorDay;
  const window = closedCycleWindow(anchorDay, today);
  const rewards = await listStreakRewardsForMember(gymId, memberId);
  const lastClosed = rewards.find((r) => r.earnedPeriod === window.earnedPeriod);

  let state: ChestState;
  if (lastClosed) {
    state = lastClosed.status === "missed" ? "missed" : "earned";
  } else if (window.cycleStart >= member.joinDate) {
    state = "pending"; // a full cycle has closed, not yet scored
  } else {
    state = "locked"; // still inside the member's first cycle
  }

  return {
    percent: gym.percent,
    chest: {
      state,
      earnedPeriod: lastClosed?.earnedPeriod ?? window.earnedPeriod,
      redeemPeriod: lastClosed?.redeemPeriod ?? window.redeemPeriod,
      percent: lastClosed?.percent ?? null,
    },
    rewards,
  };
}
