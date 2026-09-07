/**
 * Integration test for db/queries/checkins.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name
 * `test_ci %`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { checkins, gyms, members, users } from "@/db/schema";
import { CheckinError, memberStreak, recordCheckin } from "./checkins";
import { createGym, updateGym } from "./gyms";
import { createMember } from "./members";

// Gym fence at (12.9000, 77.6000), radius 100 m.
const GYM = { lat: 12.9, lng: 77.6 };
const INSIDE = { lat: 12.9004, lng: 77.6 }; // ~44 m
const OUTSIDE = { lat: 12.902, lng: 77.6 }; // ~222 m

let gymSlug = "";
let memberUserId = "";
let memberId = "";
let gymId = "";

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    const gym = await createGym({ name: "test_ci Gym" });
    gymId = gym.id;
    gymSlug = gym.slug;
    await updateGym(gymId, { geoLat: GYM.lat, geoLng: GYM.lng, checkinRadiusM: 100 });

    const m = await createMember({
      gymId,
      name: "test_ci Member",
      phone: "9600000001",
      joinDate: "2026-01-01",
    });
    memberId = m.id;
    const [u] = await db
      .insert(users)
      .values({
        email: "test_ci_member@example.com",
        role: "member",
        gymId,
        passwordHash: "x:y",
        mustChangePassword: false,
      })
      .returning({ id: users.id });
    memberUserId = u!.id;
    await db.update(members).set({ userId: memberUserId }).where(eq(members.id, memberId));
  });
  afterAll(async () => {
    await db.delete(checkins).where(eq(checkins.gymId, gymId));
    await db.delete(members).where(like(members.name, "test_ci %"));
    await db.delete(users).where(like(users.email, "test_ci_%"));
    await db.delete(gyms).where(like(gyms.name, "test_ci %"));
    await closeDb();
  });
}

dbSuite("recordCheckin", () => {
  it("rejects a check-in outside the radius", async () => {
    await expect(
      recordCheckin({
        gymSlug,
        memberUserId,
        lat: OUTSIDE.lat,
        lng: OUTSIDE.lng,
        now: new Date("2026-09-08T09:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(CheckinError);
  });

  it("records inside the radius and dedupes a same-day repeat", async () => {
    const first = await recordCheckin({
      gymSlug,
      memberUserId,
      lat: INSIDE.lat,
      lng: INSIDE.lng,
      now: new Date("2026-09-08T09:00:00Z"),
    });
    expect(first.status).toBe("ok");
    expect(first.distanceM).toBeLessThan(100);
    expect(first.streak).toBe(1);

    const again = await recordCheckin({
      gymSlug,
      memberUserId,
      lat: INSIDE.lat,
      lng: INSIDE.lng,
      now: new Date("2026-09-08T18:00:00Z"),
    });
    expect(again.status).toBe("already");
  });

  it("builds a streak over consecutive days", async () => {
    await recordCheckin({
      gymSlug,
      memberUserId,
      lat: INSIDE.lat,
      lng: INSIDE.lng,
      now: new Date("2026-09-09T09:00:00Z"),
    });
    const streak = await memberStreak(gymId, memberId, new Date("2026-09-09T20:00:00Z"));
    expect(streak).toBe(2);

    // skip 2026-09-10, check in 2026-09-11 → streak resets to 1
    await recordCheckin({
      gymSlug,
      memberUserId,
      lat: INSIDE.lat,
      lng: INSIDE.lng,
      now: new Date("2026-09-11T09:00:00Z"),
    });
    expect(await memberStreak(gymId, memberId, new Date("2026-09-11T20:00:00Z"))).toBe(1);
  });
});
