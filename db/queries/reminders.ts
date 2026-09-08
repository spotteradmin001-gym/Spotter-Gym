import "server-only";

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { dues, gyms, members, reminderJobs } from "@/db/schema";
import { addDays } from "@/lib/streak";
import { renderTemplate, type TemplateKind } from "@/lib/template";
import { formatPaise } from "@/lib/money";

import { getTemplates } from "./config";

export type ReminderStatus = "pending" | "sent" | "failed" | "skipped";

function formatDueDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Ensures a `pre_due` and an `on_due` reminder job exists for every pending due
 * of a gym, and marks jobs `skipped` when their due is no longer pending, the
 * member went inactive, or there's nothing to send from / to.
 *
 * Idempotent — `unique(due_id, kind)` means a re-run only fills gaps. Returns
 * counts.
 */
export async function planRemindersForGym(
  gymId: string,
  asOf: Date = new Date(),
): Promise<{ created: number; skipped: number }> {
  const [gym] = await db
    .select({
      reminderDaysBefore: gyms.reminderDaysBefore,
      wahaSession: gyms.wahaSessionName,
      isActive: gyms.isActive,
    })
    .from(gyms)
    .where(eq(gyms.id, gymId))
    .limit(1);
  if (!gym || !gym.isActive) return { created: 0, skipped: 0 };

  const templates = await getTemplates(gymId);

  const rows = await db
    .select({ due: dues, member: members })
    .from(dues)
    .innerJoin(members, eq(members.id, dues.memberId))
    .where(eq(dues.gymId, gymId));

  const toInsert: (typeof reminderJobs.$inferInsert)[] = [];
  const skipDueIds: string[] = [];

  for (const { due, member } of rows) {
    const sendable =
      due.status === "pending" &&
      member.status === "active" &&
      member.phone.length > 0 &&
      Boolean(gym.wahaSession);

    if (!sendable) {
      skipDueIds.push(due.id);
      continue;
    }

    for (const kind of ["pre_due", "on_due"] as TemplateKind[]) {
      const scheduledFor =
        kind === "pre_due"
          ? addDays(due.dueDate, -gym.reminderDaysBefore)
          : due.dueDate;
      const messageText = renderTemplate(templates[kind], {
        name: member.name,
        amount: formatPaise(due.amountDuePaise),
        due_date: formatDueDate(due.dueDate),
      });
      toInsert.push({
        gymId,
        memberId: member.id,
        dueId: due.id,
        kind,
        scheduledFor,
        status: "pending",
        wahaSession: gym.wahaSession,
        messageText,
      });
    }
  }

  let created = 0;
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(reminderJobs)
      .values(toInsert)
      .onConflictDoNothing({ target: [reminderJobs.dueId, reminderJobs.kind] })
      .returning({ id: reminderJobs.id });
    created = inserted.length;
  }

  let skipped = 0;
  if (skipDueIds.length > 0) {
    const updated = await db
      .update(reminderJobs)
      .set({ status: "skipped", updatedAt: new Date() })
      .where(
        and(
          inArray(reminderJobs.dueId, skipDueIds),
          eq(reminderJobs.status, "pending"),
        ),
      )
      .returning({ id: reminderJobs.id });
    skipped = updated.length;
  }

  void asOf;
  return { created, skipped };
}

export async function planRemindersForAllGyms(
  asOf: Date = new Date(),
): Promise<{ gyms: number; created: number; skipped: number }> {
  const active = await db
    .select({ id: gyms.id })
    .from(gyms)
    .where(eq(gyms.isActive, true));
  let created = 0;
  let skipped = 0;
  for (const gym of active) {
    const r = await planRemindersForGym(gym.id, asOf);
    created += r.created;
    skipped += r.skipped;
  }
  return { gyms: active.length, created, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads (Batch 6.3)
// ─────────────────────────────────────────────────────────────────────────────

export type ReminderJob = {
  id: string;
  memberId: string;
  memberName: string;
  kind: TemplateKind;
  scheduledFor: string;
  status: ReminderStatus;
  sentAt: string | null;
  error: string | null;
  attempts: number;
};

export async function listReminderJobs(
  gymId: string,
  opts: { status?: ReminderStatus; memberId?: string; limit?: number } = {},
): Promise<ReminderJob[]> {
  const where = [eq(reminderJobs.gymId, gymId)];
  if (opts.status) where.push(eq(reminderJobs.status, opts.status));
  if (opts.memberId) where.push(eq(reminderJobs.memberId, opts.memberId));

  const rows = await db
    .select({ job: reminderJobs, memberName: members.name })
    .from(reminderJobs)
    .innerJoin(members, eq(members.id, reminderJobs.memberId))
    .where(and(...where))
    .orderBy(sql`${reminderJobs.scheduledFor} desc, ${reminderJobs.createdAt} desc`)
    .limit(opts.limit ?? 100);

  return rows.map((r) => ({
    id: r.job.id,
    memberId: r.job.memberId,
    memberName: r.memberName,
    kind: r.job.kind as TemplateKind,
    scheduledFor: r.job.scheduledFor,
    status: r.job.status as ReminderStatus,
    sentAt: r.job.sentAt ? r.job.sentAt.toISOString() : null,
    error: r.job.error ?? null,
    attempts: r.job.attempts,
  }));
}

export async function reminderCounts(
  gymId: string,
  asOf: Date = new Date(),
): Promise<{ sentToday: number; pending: number; failed: number }> {
  const today = asOf.toISOString().slice(0, 10);
  const [[sentToday], [pending], [failed]] = await Promise.all([
    db
      .select({ v: sql<number>`count(*)::int` })
      .from(reminderJobs)
      .where(
        and(
          eq(reminderJobs.gymId, gymId),
          eq(reminderJobs.status, "sent"),
          sql`${reminderJobs.sentAt} >= ${today}`,
        ),
      ),
    db
      .select({ v: sql<number>`count(*)::int` })
      .from(reminderJobs)
      .where(and(eq(reminderJobs.gymId, gymId), eq(reminderJobs.status, "pending"))),
    db
      .select({ v: sql<number>`count(*)::int` })
      .from(reminderJobs)
      .where(and(eq(reminderJobs.gymId, gymId), eq(reminderJobs.status, "failed"))),
  ]);
  return { sentToday: sentToday.v, pending: pending.v, failed: failed.v };
}

export class ReminderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReminderError";
  }
}

/** Manual "resend": re-arm a job so the next sender run picks it up. */
export async function requeueReminderJob(
  gymId: string,
  jobId: string,
): Promise<void> {
  await db
    .update(reminderJobs)
    .set({ status: "pending", error: null, updatedAt: new Date() })
    .where(
      and(
        eq(reminderJobs.id, jobId),
        eq(reminderJobs.gymId, gymId),
        ne(reminderJobs.status, "sent"),
      ),
    );
}

/**
 * Manual "send reminder now" for a member: targets their soonest pending due,
 * (re)arms an `on_due` job for it scheduled today. The local sender picks it up
 * on its next run.
 */
export async function queueImmediateReminder(
  gymId: string,
  memberId: string,
  asOf: Date = new Date(),
): Promise<void> {
  const today = asOf.toISOString().slice(0, 10);

  const [gym] = await db
    .select({ waha: gyms.wahaSessionName })
    .from(gyms)
    .where(eq(gyms.id, gymId))
    .limit(1);
  if (!gym?.waha) {
    throw new ReminderError("Set a WAHA session for the gym in Settings first.");
  }

  const [row] = await db
    .select({ due: dues, member: members })
    .from(dues)
    .innerJoin(members, eq(members.id, dues.memberId))
    .where(
      and(
        eq(dues.gymId, gymId),
        eq(dues.memberId, memberId),
        eq(dues.status, "pending"),
      ),
    )
    .orderBy(sql`${dues.dueDate} asc`)
    .limit(1);
  if (!row) throw new ReminderError("This member has nothing due to remind about.");
  if (row.member.phone.length === 0) {
    throw new ReminderError("This member has no phone number.");
  }

  const templates = await getTemplates(gymId);
  const messageText = renderTemplate(templates.on_due, {
    name: row.member.name,
    amount: formatPaise(row.due.amountDuePaise),
    due_date: formatDueDate(row.due.dueDate),
  });

  await db
    .insert(reminderJobs)
    .values({
      gymId,
      memberId,
      dueId: row.due.id,
      kind: "on_due",
      scheduledFor: today,
      status: "pending",
      wahaSession: gym.waha,
      messageText,
    })
    .onConflictDoUpdate({
      target: [reminderJobs.dueId, reminderJobs.kind],
      set: {
        status: "pending",
        scheduledFor: today,
        error: null,
        messageText,
        updatedAt: new Date(),
      },
    });
}
