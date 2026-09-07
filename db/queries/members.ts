import "server-only";

import { and, asc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/db/client";
import { gyms, members } from "@/db/schema";
import { normalizePhone, PhoneError } from "@/lib/phone";

export class MemberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemberError";
  }
}

export type MemberStatus = "active" | "inactive";

export type Member = {
  id: string;
  gymId: string;
  userId: string | null;
  name: string;
  phone: string;
  email: string | null;
  joinDate: string;
  /** As stored: null means "use the gym default". */
  monthlyFeePaise: number | null;
  /** The fee that actually applies (override, else the gym default, else 0). */
  resolvedFeePaise: number;
  billingAnchorDay: number;
  status: MemberStatus;
  profile: Record<string, string>;
  createdAt: string;
};

/** The fee that applies to a member: their override, else the gym default, else 0. */
export function resolveFeePaise(
  memberFeePaise: number | null,
  gymDefaultPaise: number | null,
): number {
  if (memberFeePaise != null) return memberFeePaise;
  if (gymDefaultPaise != null) return gymDefaultPaise;
  return 0;
}

function mapMember(
  row: typeof members.$inferSelect,
  gymDefaultPaise: number | null,
): Member {
  return {
    id: row.id,
    gymId: row.gymId,
    userId: row.userId ?? null,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    joinDate: row.joinDate,
    monthlyFeePaise: row.monthlyFeePaise ?? null,
    resolvedFeePaise: resolveFeePaise(row.monthlyFeePaise ?? null, gymDefaultPaise),
    billingAnchorDay: row.billingAnchorDay,
    status: row.status as MemberStatus,
    profile: (row.profile ?? {}) as Record<string, string>,
    createdAt: row.createdAt.toISOString(),
  };
}

async function gymDefaultFee(gymId: string): Promise<number | null> {
  const [gym] = await db
    .select({ fee: gyms.defaultMonthlyFeePaise })
    .from(gyms)
    .where(eq(gyms.id, gymId))
    .limit(1);
  if (!gym) throw new MemberError("That gym no longer exists.");
  return gym.fee ?? null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createMember(input: {
  gymId: string;
  name: string;
  phone: string;
  email?: string;
  joinDate: string;
  monthlyFeePaise?: number | null;
  billingAnchorDay?: number;
  profile?: Record<string, string>;
}): Promise<Member> {
  const name = input.name.trim();
  if (name.length < 2) throw new MemberError("Enter the member's name.");

  let phone: string;
  try {
    phone = normalizePhone(input.phone);
  } catch (error) {
    if (error instanceof PhoneError) throw new MemberError(error.message);
    throw error;
  }

  if (!ISO_DATE_RE.test(input.joinDate)) {
    throw new MemberError("Enter a valid join date.");
  }
  const anchor = input.billingAnchorDay ?? 1;
  if (anchor < 1 || anchor > 28) {
    throw new MemberError("Billing day must be between 1 and 28.");
  }
  if (
    input.monthlyFeePaise != null &&
    (!Number.isInteger(input.monthlyFeePaise) || input.monthlyFeePaise < 0)
  ) {
    throw new MemberError("The fee must be a whole number of paise.");
  }

  const gymDefault = await gymDefaultFee(input.gymId);

  const [dupe] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.gymId, input.gymId), eq(members.phone, phone)))
    .limit(1);
  if (dupe) throw new MemberError("A member with that phone already exists.");

  const [row] = await db
    .insert(members)
    .values({
      gymId: input.gymId,
      name,
      phone,
      email: input.email?.trim() || null,
      joinDate: input.joinDate,
      monthlyFeePaise: input.monthlyFeePaise ?? null,
      billingAnchorDay: anchor,
      profile: input.profile ?? {},
    })
    .returning();
  return mapMember(row!, gymDefault);
}

export async function listMembers(
  gymId: string,
  opts: { search?: string; status?: MemberStatus } = {},
): Promise<Member[]> {
  const where = [eq(members.gymId, gymId)];
  if (opts.status) where.push(eq(members.status, opts.status));
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    where.push(or(ilike(members.name, q), ilike(members.phone, q))!);
  }

  const [gymDefault, rows] = await Promise.all([
    gymDefaultFee(gymId),
    db
      .select()
      .from(members)
      .where(and(...where))
      .orderBy(asc(members.name)),
  ]);
  return rows.map((row) => mapMember(row, gymDefault));
}

export async function getMember(
  gymId: string,
  id: string,
): Promise<Member | null> {
  const [row] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, id), eq(members.gymId, gymId)))
    .limit(1);
  if (!row) return null;
  return mapMember(row, await gymDefaultFee(gymId));
}

/** The member record for an activated member's own login. */
export async function getMemberByUserId(userId: string): Promise<Member | null> {
  const [row] = await db
    .select()
    .from(members)
    .where(eq(members.userId, userId))
    .limit(1);
  if (!row) return null;
  return mapMember(row, await gymDefaultFee(row.gymId));
}

/** Merge answers into a member's `profile` jsonb (own-service, keyed by field key). */
export async function updateMemberProfile(
  memberId: string,
  values: Record<string, string>,
): Promise<void> {
  const [row] = await db
    .select({ profile: members.profile })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);
  if (!row) throw new MemberError("That member no longer exists.");
  const merged = { ...(row.profile as Record<string, string>), ...values };
  await db
    .update(members)
    .set({ profile: merged, updatedAt: new Date() })
    .where(eq(members.id, memberId));
}

export async function updateMember(
  gymId: string,
  id: string,
  patch: Partial<{
    name: string;
    phone: string;
    email: string | null;
    billingAnchorDay: number;
    profile: Record<string, string>;
  }>,
): Promise<Member> {
  const set: Partial<typeof members.$inferInsert> = { updatedAt: new Date() };

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length < 2) throw new MemberError("Enter the member's name.");
    set.name = name;
  }
  if (patch.phone !== undefined) {
    try {
      set.phone = normalizePhone(patch.phone);
    } catch (error) {
      if (error instanceof PhoneError) throw new MemberError(error.message);
      throw error;
    }
  }
  if (patch.email !== undefined) set.email = patch.email?.trim() || null;
  if (patch.billingAnchorDay !== undefined) {
    if (patch.billingAnchorDay < 1 || patch.billingAnchorDay > 28) {
      throw new MemberError("Billing day must be between 1 and 28.");
    }
    set.billingAnchorDay = patch.billingAnchorDay;
  }
  if (patch.profile !== undefined) set.profile = patch.profile;

  const [row] = await db
    .update(members)
    .set(set)
    .where(and(eq(members.id, id), eq(members.gymId, gymId)))
    .returning();
  if (!row) throw new MemberError("That member no longer exists.");
  return mapMember(row, await gymDefaultFee(gymId));
}

export async function setMemberStatus(
  gymId: string,
  id: string,
  status: MemberStatus,
): Promise<void> {
  const rows = await db
    .update(members)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(members.id, id), eq(members.gymId, gymId)))
    .returning({ id: members.id });
  if (rows.length === 0) throw new MemberError("That member no longer exists.");
}

export async function setMemberFee(
  gymId: string,
  id: string,
  monthlyFeePaise: number | null,
): Promise<void> {
  if (
    monthlyFeePaise != null &&
    (!Number.isInteger(monthlyFeePaise) || monthlyFeePaise < 0)
  ) {
    throw new MemberError("The fee must be a whole number of paise.");
  }
  const rows = await db
    .update(members)
    .set({ monthlyFeePaise, updatedAt: new Date() })
    .where(and(eq(members.id, id), eq(members.gymId, gymId)))
    .returning({ id: members.id });
  if (rows.length === 0) throw new MemberError("That member no longer exists.");
}
