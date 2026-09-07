import "server-only";

import { and, asc, between, desc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { dues, members, payments } from "@/db/schema";
import { reportRange, type RangeKind } from "@/lib/billing";

export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export type PaymentMethod = "cash" | "upi" | "card" | "bank" | "other";
const METHODS: PaymentMethod[] = ["cash", "upi", "card", "bank", "other"];

export type Payment = {
  id: string;
  memberId: string;
  memberName: string;
  gymId: string;
  amountPaise: number;
  paidOn: string;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Re-derives every non-waived due's status for one member: walk them
 * oldest-first, marking `paid` while the running total owed is covered by the
 * member's total payments, `pending` after that. Idempotent — safe to call
 * after any payment or due change.
 */
export async function reconcileMemberDues(
  gymId: string,
  memberId: string,
): Promise<void> {
  const [{ paid } = { paid: 0 }] = await db
    .select({ paid: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint` })
    .from(payments)
    .where(and(eq(payments.gymId, gymId), eq(payments.memberId, memberId)));

  const totalPaid = Number(paid);

  const rows = await db
    .select()
    .from(dues)
    .where(
      and(
        eq(dues.gymId, gymId),
        eq(dues.memberId, memberId),
        ne(dues.status, "waived"),
      ),
    )
    .orderBy(asc(dues.dueDate), asc(dues.periodMonth));

  let running = 0;
  for (const due of rows) {
    running += due.amountDuePaise;
    const next = running <= totalPaid ? "paid" : "pending";
    if (next !== due.status) {
      await db
        .update(dues)
        .set({ status: next, updatedAt: new Date() })
        .where(eq(dues.id, due.id));
    }
  }
}

export async function recordPayment(input: {
  gymId: string;
  memberId: string;
  amountPaise: number;
  paidOn: string;
  method: string;
  note?: string;
  recordedBy: string;
}): Promise<void> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new PaymentError("Enter an amount greater than zero.");
  }
  if (!ISO_DATE_RE.test(input.paidOn)) {
    throw new PaymentError("Enter a valid payment date.");
  }
  const method = METHODS.includes(input.method as PaymentMethod)
    ? (input.method as PaymentMethod)
    : "other";

  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.id, input.memberId), eq(members.gymId, input.gymId)))
    .limit(1);
  if (!member) throw new PaymentError("That member no longer exists.");

  const [oldestPending] = await db
    .select({ id: dues.id })
    .from(dues)
    .where(
      and(
        eq(dues.gymId, input.gymId),
        eq(dues.memberId, input.memberId),
        eq(dues.status, "pending"),
      ),
    )
    .orderBy(asc(dues.dueDate))
    .limit(1);

  await db.insert(payments).values({
    memberId: input.memberId,
    gymId: input.gymId,
    dueId: oldestPending?.id ?? null,
    amountPaise: input.amountPaise,
    paidOn: input.paidOn,
    method,
    recordedBy: input.recordedBy,
    note: input.note?.trim() || null,
  });

  await reconcileMemberDues(input.gymId, input.memberId);
}

function mapPayment(row: {
  payment: typeof payments.$inferSelect;
  memberName: string;
}): Payment {
  return {
    id: row.payment.id,
    memberId: row.payment.memberId,
    memberName: row.memberName,
    gymId: row.payment.gymId,
    amountPaise: row.payment.amountPaise,
    paidOn: row.payment.paidOn,
    method: row.payment.method as PaymentMethod,
    note: row.payment.note ?? null,
    createdAt: row.payment.createdAt.toISOString(),
  };
}

export async function listPayments(
  gymId: string,
  opts: { period?: RangeKind; memberId?: string; asOf?: Date } = {},
): Promise<Payment[]> {
  const where = [eq(payments.gymId, gymId)];
  if (opts.memberId) where.push(eq(payments.memberId, opts.memberId));
  if (opts.period) {
    const { from, to } = reportRange(opts.period, opts.asOf ?? new Date());
    where.push(between(payments.paidOn, from, to));
  }

  const rows = await db
    .select({ payment: payments, memberName: members.name })
    .from(payments)
    .innerJoin(members, eq(members.id, payments.memberId))
    .where(and(...where))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt));
  return rows.map(mapPayment);
}

export type PaymentsSummary = {
  collectedPaise: number;
  outstandingPaise: number;
  dueTodayPaise: number;
};

export async function paymentsSummary(
  gymId: string,
  opts: { period?: RangeKind; asOf?: Date } = {},
): Promise<PaymentsSummary> {
  const asOf = opts.asOf ?? new Date();
  const today = asOf.toISOString().slice(0, 10);
  const { from, to } = reportRange(opts.period ?? "month", asOf);

  const [[collected], [totalDue], [totalPaid], [dueToday]] = await Promise.all([
    db
      .select({ v: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint` })
      .from(payments)
      .where(and(eq(payments.gymId, gymId), between(payments.paidOn, from, to))),
    db
      .select({ v: sql<number>`coalesce(sum(${dues.amountDuePaise}), 0)::bigint` })
      .from(dues)
      .where(and(eq(dues.gymId, gymId), ne(dues.status, "waived"))),
    db
      .select({ v: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint` })
      .from(payments)
      .where(eq(payments.gymId, gymId)),
    db
      .select({ v: sql<number>`coalesce(sum(${dues.amountDuePaise}), 0)::bigint` })
      .from(dues)
      .where(
        and(
          eq(dues.gymId, gymId),
          eq(dues.status, "pending"),
          sql`${dues.dueDate} <= ${today}`,
        ),
      ),
  ]);

  const outstanding = Math.max(0, Number(totalDue.v) - Number(totalPaid.v));
  return {
    collectedPaise: Number(collected.v),
    outstandingPaise: outstanding,
    dueTodayPaise: Number(dueToday.v),
  };
}
