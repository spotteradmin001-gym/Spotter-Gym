/**
 * Integration test for db/queries/streak-rewards.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name
 * `test_reward %`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { checkins, dues, gyms, members, streakRewards } from "@/db/schema";
import { addDays } from "@/lib/streak";

import { generateDuesForGym, listDuesForMember } from "./dues";
import { createGym, updateGym } from "./gyms";
import { createMember } from "./members";
import {
  applyDueStreakDiscounts,
  evaluateStreakRewardsForGym,
  listStreakRewardsForMember,
} from "./streak-rewards";

// anchor day 1 (fixed) → the cycle that closed as of 2026-09-15 is August 2026.
const AS_OF = new Date("2026-09-15T00:00:00Z");
const CYCLE_FROM = "2026-08-01";
const CYCLE_TO = "2026-09-01"; // exclusive

function augustOpenDays(): string[] {
  const out: string[] = [];
  for (let d = CYCLE_FROM; d < CYCLE_TO; d = addDays(d, 1)) {
    if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) out.push(d); // skip Sundays
  }
  return out;
}

async function seedGym(name: string, percent: number, buffer = 0): Promise<string> {
  const gym = await createGym({ name });
  await updateGym(gym.id, {
    defaultMonthlyFeePaise: 100_000,
    billingAnchorMode: "fixed",
    billingAnchorDay: 1,
    streakRewardPercent: percent,
    streakAllowedMisses: buffer,
  });
  return gym.id;
}

async function addCheckins(gymId: string, memberId: string, days: string[]) {
  if (days.length === 0) return;
  await db.insert(checkins).values(
    days.map((d) => ({ memberId, gymId, checkinDate: d, method: "qr" as const })),
  );
}

let cleanupGymIds: string[] = [];

if (process.env.DATABASE_URL) {
  beforeAll(() => {
    cleanupGymIds = [];
  });
  afterAll(async () => {
    for (const gymId of cleanupGymIds) {
      await db.delete(streakRewards).where(eq(streakRewards.gymId, gymId));
      await db.delete(checkins).where(eq(checkins.gymId, gymId));
      await db.delete(dues).where(eq(dues.gymId, gymId));
    }
    await db.delete(members).where(like(members.name, "test_reward %"));
    await db.delete(gyms).where(like(gyms.name, "test_reward %"));
    await closeDb();
  });
}

dbSuite("evaluateStreakRewardsForGym", () => {
  it("earns on a clean cycle, is idempotent, and redeems at N+2", async () => {
    const gymId = await seedGym("test_reward Clean", 10);
    cleanupGymIds.push(gymId);
    const m = await createMember({
      gymId,
      name: "test_reward Alice",
      phone: "9700000001",
      joinDate: "2026-01-01",
    });
    await addCheckins(gymId, m.id, augustOpenDays());

    const first = await evaluateStreakRewardsForGym(gymId, AS_OF);
    expect(first).toEqual({ earned: 1, missed: 0 });

    const rows = await listStreakRewardsForMember(gymId, m.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.earnedPeriod).toBe("2026-08-01");
    expect(rows[0]!.redeemPeriod).toBe("2026-10-01"); // N+2
    expect(rows[0]!.status).toBe("earned");
    expect(rows[0]!.percent).toBe(10);

    // idempotent
    expect(await evaluateStreakRewardsForGym(gymId, AS_OF)).toEqual({
      earned: 0,
      missed: 0,
    });
  });

  it("is all-or-nothing: one missed open day with no buffer → missed", async () => {
    const gymId = await seedGym("test_reward Miss", 10, 0);
    cleanupGymIds.push(gymId);
    const m = await createMember({
      gymId,
      name: "test_reward Bob",
      phone: "9700000002",
      joinDate: "2026-01-01",
    });
    await addCheckins(gymId, m.id, augustOpenDays().slice(1)); // drop one open day

    expect(await evaluateStreakRewardsForGym(gymId, AS_OF)).toEqual({
      earned: 0,
      missed: 1,
    });
    expect((await listStreakRewardsForMember(gymId, m.id))[0]!.status).toBe("missed");
  });

  it("forgives a miss within the buffer", async () => {
    const gymId = await seedGym("test_reward Buffer", 10, 1);
    cleanupGymIds.push(gymId);
    const m = await createMember({
      gymId,
      name: "test_reward Carol",
      phone: "9700000003",
      joinDate: "2026-01-01",
    });
    await addCheckins(gymId, m.id, augustOpenDays().slice(1)); // one miss, buffer 1

    expect(await evaluateStreakRewardsForGym(gymId, AS_OF)).toEqual({
      earned: 1,
      missed: 0,
    });
  });

  it("is fully inert when streak_reward_percent is 0", async () => {
    const gymId = await seedGym("test_reward Off", 0);
    cleanupGymIds.push(gymId);
    const m = await createMember({
      gymId,
      name: "test_reward Dave",
      phone: "9700000004",
      joinDate: "2026-01-01",
    });
    await addCheckins(gymId, m.id, augustOpenDays());

    expect(await evaluateStreakRewardsForGym(gymId, AS_OF)).toEqual({
      earned: 0,
      missed: 0,
    });
    expect(await listStreakRewardsForMember(gymId, m.id)).toHaveLength(0);
  });
});

dbSuite("applyDueStreakDiscounts", () => {
  it("applies the percent once, ties it to the redeem-period due, and is idempotent", async () => {
    const gymId = await seedGym("test_reward Redeem", 10);
    cleanupGymIds.push(gymId);
    const m = await createMember({
      gymId,
      name: "test_reward Erin",
      phone: "9700000005",
      joinDate: "2026-01-01",
    });
    await addCheckins(gymId, m.id, augustOpenDays());
    await evaluateStreakRewardsForGym(gymId, AS_OF);

    // Generate the October due (redeem period). generateDuesForGym runs the
    // apply step itself.
    await generateDuesForGym(gymId, new Date("2026-10-02T00:00:00Z"));

    const octDue = (await listDuesForMember(gymId, m.id)).find(
      (d) => d.periodMonth === "2026-10-01",
    );
    expect(octDue?.amountDuePaise).toBe(90_000); // 10% off 100000

    const reward = (await listStreakRewardsForMember(gymId, m.id)).find(
      (r) => r.earnedPeriod === "2026-08-01",
    );
    expect(reward?.status).toBe("applied");
    expect(reward?.appliedDueId).toBe(octDue?.id);

    // running apply again does nothing
    const again = await applyDueStreakDiscounts(gymId);
    expect(again.applied).toBe(0);
    const octDueAfter = (await listDuesForMember(gymId, m.id)).find(
      (d) => d.periodMonth === "2026-10-01",
    );
    expect(octDueAfter?.amountDuePaise).toBe(90_000);
  });
});
