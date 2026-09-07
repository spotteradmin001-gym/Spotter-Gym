import "server-only";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { gyms } from "@/db/schema";

/** Caller-facing failures; the server-action layer maps this to user copy. */
export class GymError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GymError";
  }
}

export type Gym = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  address: string | null;
  geoLat: number | null;
  geoLng: number | null;
  checkinRadiusM: number;
  wahaSessionName: string | null;
  defaultMonthlyFeePaise: number | null;
  reminderDaysBefore: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapGym(row: typeof gyms.$inferSelect): Gym {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timezone: row.timezone,
    address: row.address ?? null,
    geoLat: row.geoLat ?? null,
    geoLng: row.geoLng ?? null,
    checkinRadiusM: row.checkinRadiusM,
    wahaSessionName: row.wahaSessionName ?? null,
    defaultMonthlyFeePaise: row.defaultMonthlyFeePaise ?? null,
    reminderDaysBefore: row.reminderDaysBefore,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** A slug not already taken — appends -2, -3, … on collision. */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || "gym";
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const [taken] = await db
      .select({ id: gyms.id })
      .from(gyms)
      .where(eq(gyms.slug, candidate))
      .limit(1);
    if (!taken) return candidate;
  }
}

const TZ_RE = /^[A-Za-z]+\/[A-Za-z0-9_+-]+$/;

export async function createGym(input: {
  name: string;
  timezone?: string;
}): Promise<Gym> {
  const name = input.name.trim();
  if (name.length < 2) {
    throw new GymError("Enter the gym's name.");
  }
  const timezone = input.timezone?.trim() || "Asia/Kolkata";
  if (!TZ_RE.test(timezone)) {
    throw new GymError("Enter a valid IANA timezone, e.g. Asia/Kolkata.");
  }

  const [row] = await db
    .insert(gyms)
    .values({ name, slug: await uniqueSlug(slugify(name)), timezone })
    .returning();
  return mapGym(row!);
}

export async function listGyms(
  opts: { includeInactive?: boolean } = {},
): Promise<Gym[]> {
  const rows = await db.select().from(gyms).orderBy(asc(gyms.name));
  const mapped = rows.map(mapGym);
  return opts.includeInactive ? mapped : mapped.filter((g) => g.isActive);
}

export async function getGym(id: string): Promise<Gym | null> {
  const [row] = await db.select().from(gyms).where(eq(gyms.id, id)).limit(1);
  return row ? mapGym(row) : null;
}

export type GymPatch = Partial<{
  name: string;
  timezone: string;
  address: string | null;
  geoLat: number | null;
  geoLng: number | null;
  checkinRadiusM: number;
  wahaSessionName: string | null;
  defaultMonthlyFeePaise: number | null;
  reminderDaysBefore: number;
}>;

export async function updateGym(id: string, patch: GymPatch): Promise<Gym> {
  const set: Partial<typeof gyms.$inferInsert> = { updatedAt: new Date() };

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2) throw new GymError("Enter the gym's name.");
    set.name = name;
  }
  if (patch.timezone !== undefined) {
    const tz = patch.timezone.trim();
    if (!TZ_RE.test(tz)) {
      throw new GymError("Enter a valid IANA timezone, e.g. Asia/Kolkata.");
    }
    set.timezone = tz;
  }
  if (patch.address !== undefined) set.address = patch.address?.trim() || null;
  if (patch.geoLat !== undefined) set.geoLat = patch.geoLat;
  if (patch.geoLng !== undefined) set.geoLng = patch.geoLng;
  if (patch.wahaSessionName !== undefined) {
    set.wahaSessionName = patch.wahaSessionName?.trim() || null;
  }
  if (patch.defaultMonthlyFeePaise !== undefined) {
    if (
      patch.defaultMonthlyFeePaise !== null &&
      (!Number.isInteger(patch.defaultMonthlyFeePaise) ||
        patch.defaultMonthlyFeePaise < 0)
    ) {
      throw new GymError("The default fee must be a whole number of paise.");
    }
    set.defaultMonthlyFeePaise = patch.defaultMonthlyFeePaise;
  }
  if (patch.checkinRadiusM !== undefined) {
    if (patch.checkinRadiusM < 10 || patch.checkinRadiusM > 5000) {
      throw new GymError("Check-in radius must be between 10 and 5000 metres.");
    }
    set.checkinRadiusM = patch.checkinRadiusM;
  }
  if (patch.reminderDaysBefore !== undefined) {
    if (patch.reminderDaysBefore < 0 || patch.reminderDaysBefore > 30) {
      throw new GymError("Reminder lead time must be between 0 and 30 days.");
    }
    set.reminderDaysBefore = patch.reminderDaysBefore;
  }

  const [row] = await db
    .update(gyms)
    .set(set)
    .where(eq(gyms.id, id))
    .returning();
  if (!row) throw new GymError("That gym no longer exists.");
  return mapGym(row);
}

export async function setGymActive(input: {
  id: string;
  isActive: boolean;
}): Promise<void> {
  const rows = await db
    .update(gyms)
    .set({ isActive: input.isActive, updatedAt: new Date() })
    .where(eq(gyms.id, input.id))
    .returning({ id: gyms.id });
  if (rows.length === 0) throw new GymError("That gym no longer exists.");
}
