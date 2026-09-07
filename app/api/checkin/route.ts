import { NextResponse } from "next/server";

import { CheckinError, getGymBySlug, getSessionUser, recordCheckin } from "@/db/queries";
import { readSessionCookie } from "@/src/features/auth/session-cookie";
import { verifyCheckinToken } from "@/src/features/checkin/token";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSessionUser(await readSessionCookie());
  if (!user || user.role !== "member") {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  let body: { gymSlug?: string; token?: string; lat?: number; lng?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { gymSlug, token, lat, lng } = body;
  if (
    typeof gymSlug !== "string" ||
    typeof token !== "string" ||
    typeof lat !== "number" ||
    typeof lng !== "number"
  ) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const gym = await getGymBySlug(gymSlug);
  if (!gym) {
    return NextResponse.json({ error: "Gym not found." }, { status: 404 });
  }
  if (!verifyCheckinToken(gym.id, token)) {
    return NextResponse.json(
      { error: "That QR code has expired — scan the current one." },
      { status: 400 },
    );
  }

  try {
    const result = await recordCheckin({
      gymSlug,
      memberUserId: user.id,
      lat,
      lng,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CheckinError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
