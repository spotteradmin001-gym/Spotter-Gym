import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { checkins, gyms, members } from "@/db/schema";
import { haversineMetres } from "@/lib/haversine";
import { currentStreak } from "@/lib/streak";

export class CheckinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckinError";
  }
}

export type CheckinResult = {
  status: "ok" | "already" ;
  streak: number;
  distanceM: number;
};

/**
 * Records a member's QR check-in. Verifies the gym has a geo fence, the phone
 * is inside `checkin_radius_m`, and there isn't already a check-in today.
 * Token freshness is the caller's job (it needs `SESSION_SECRET`).
 */
export async function recordCheckin(input: {
  gymSlug: string;
  memberUserId: string;
  lat: number;
  lng: number;
  now?: Date;
}): Promise<CheckinResult> {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const [gym] = await db
    .select()
    .from(gyms)
    .where(eq(gyms.slug, input.gymSlug))
    .limit(1);
  if (!gym || !gym.isActive) throw new CheckinError("Gym not found.");
  if (gym.geoLat == null || gym.geoLng == null) {
    throw new CheckinError("This gym hasn't set its check-in location yet.");
  }

  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.userId, input.memberUserId), eq(members.gymId, gym.id)))
    .limit(1);
  if (!member) throw new CheckinError("You're not a member of this gym.");
  if (member.status !== "active") {
    throw new CheckinError("Your membership isn't active.");
  }

  const distance = Math.round(
    haversineMetres(
      { lat: input.lat, lng: input.lng },
      { lat: gym.geoLat, lng: gym.geoLng },
    ),
  );
  if (distance > gym.checkinRadiusM) {
    throw new CheckinError(
      `You're ${distance} m away — get within ${gym.checkinRadiusM} m of the gym.`,
    );
  }

  const inserted = await db
    .insert(checkins)
    .values({
      memberId: member.id,
      gymId: gym.id,
      checkinDate: today,
      method: "qr",
      geoLat: input.lat,
      geoLng: input.lng,
      distanceM: distance,
      checkedInAt: now,
    })
    .onConflictDoNothing({ target: [checkins.memberId, checkins.checkinDate] })
    .returning({ id: checkins.id });

  const streak = await memberStreak(gym.id, member.id, now);
  return {
    status: inserted.length ? "ok" : "already",
    streak,
    distanceM: distance,
  };
}

export async function memberStreak(
  gymId: string,
  memberId: string,
  asOf: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ d: checkins.checkinDate })
    .from(checkins)
    .where(and(eq(checkins.gymId, gymId), eq(checkins.memberId, memberId)))
    .orderBy(desc(checkins.checkinDate))
    .limit(400);
  return currentStreak(
    rows.map((r) => r.d),
    asOf.toISOString().slice(0, 10),
  );
}

export async function listRecentCheckins(
  gymId: string,
  memberId: string,
  limit = 30,
): Promise<{ date: string; distanceM: number | null }[]> {
  const rows = await db
    .select({ d: checkins.checkinDate, dist: checkins.distanceM })
    .from(checkins)
    .where(and(eq(checkins.gymId, gymId), eq(checkins.memberId, memberId)))
    .orderBy(desc(checkins.checkinDate))
    .limit(limit);
  return rows.map((r) => ({ date: r.d, distanceM: r.dist ?? null }));
}
