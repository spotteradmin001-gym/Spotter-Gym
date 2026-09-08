import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { audits, users } from "@/db/schema";

export type AuditInput = {
  actorUserId: string;
  actorRole: string;
  gymId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Records one audit row. Never throws — an audit failure must not break the
 * action it was logging; it's logged to the server console instead.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await db.insert(audits).values({
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      gymId: input.gymId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      meta: input.meta ?? null,
    });
  } catch (error) {
    console.error("[audit] failed to write", input.action, error);
  }
}

export type AuditEntry = {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export async function listAudits(
  opts: { gymId?: string | null; limit?: number } = {},
): Promise<AuditEntry[]> {
  const where =
    opts.gymId === undefined ? [] : [eq(audits.gymId, opts.gymId as string)];

  const rows = await db
    .select({ audit: audits, actorEmail: users.email })
    .from(audits)
    .leftJoin(users, eq(users.id, audits.actorUserId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(audits.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({
    id: r.audit.id,
    actorEmail: r.actorEmail ?? null,
    actorRole: r.audit.actorRole ?? null,
    action: r.audit.action,
    targetType: r.audit.targetType,
    targetId: r.audit.targetId ?? null,
    meta: (r.audit.meta ?? null) as Record<string, unknown> | null,
    createdAt: r.audit.createdAt.toISOString(),
  }));
}
