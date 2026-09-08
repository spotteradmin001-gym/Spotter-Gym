import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { audits, employees, users } from "@/db/schema";
import { reportRange, type RangeKind } from "@/lib/billing";

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

/**
 * The audit `action` strings the owner "staff activity" view surfaces (CR-5).
 * Business events only — a payment recorded, a member created or edited, an
 * expense created or edited, a permission request filed or decided. Auth,
 * session, security and admin/owner-config actions are deliberately absent, and
 * the view never shows the raw `meta` payload. Kept as one constant so the
 * query and any future label map stay in step.
 */
export const STAFF_ACTIVITY_ACTIONS = [
  "payment.record",
  "member.create",
  "member.edit",
  "member.status",
  "expense.create",
  "expense.edit",
  "permission_request.filed",
  "approval.approved",
  "approval.rejected",
] as const;

export type StaffActivityEntry = {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  amountPaise: number | null;
  createdAt: string;
};

/**
 * What this gym's *employees* did, for the owner's staff-activity page. A
 * filtered read over `audits`: this gym only, `actor_role = 'employee'` only,
 * and only the allow-listed business actions above. Never returns a row from
 * another gym and never an admin or owner action. Newest first, bounded to the
 * reporting period (this month / last 3 / last 12), optionally narrowed to one
 * employee by their login id.
 */
export async function listStaffActivity(
  gymId: string,
  opts: {
    period?: RangeKind;
    employeeUserId?: string;
    asOf?: Date;
    limit?: number;
  } = {},
): Promise<StaffActivityEntry[]> {
  const { from, to } = reportRange(opts.period ?? "month", opts.asOf ?? new Date());

  const where = [
    eq(audits.gymId, gymId),
    eq(audits.actorRole, "employee"),
    inArray(audits.action, [...STAFF_ACTIVITY_ACTIONS]),
    sql`${audits.createdAt} >= ${from}::date`,
    sql`${audits.createdAt} < (${to}::date + 1)`,
  ];
  if (opts.employeeUserId) {
    where.push(eq(audits.actorUserId, opts.employeeUserId));
  }

  const rows = await db
    .select({
      audit: audits,
      actorEmail: users.email,
      actorName: employees.name,
    })
    .from(audits)
    .leftJoin(users, eq(users.id, audits.actorUserId))
    .leftJoin(employees, eq(employees.userId, audits.actorUserId))
    .where(and(...where))
    .orderBy(desc(audits.createdAt))
    .limit(opts.limit ?? 300);

  return rows.map((r) => {
    const meta = (r.audit.meta ?? null) as Record<string, unknown> | null;
    const amountPaise =
      meta && typeof meta.amountPaise === "number" ? meta.amountPaise : null;
    return {
      id: r.audit.id,
      actorUserId: r.audit.actorUserId ?? null,
      actorName: r.actorName ?? null,
      actorEmail: r.actorEmail ?? null,
      action: r.audit.action,
      targetType: r.audit.targetType,
      targetId: r.audit.targetId ?? null,
      amountPaise,
      createdAt: r.audit.createdAt.toISOString(),
    };
  });
}
