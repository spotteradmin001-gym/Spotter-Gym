import "server-only";

import { and, between, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { expenses, payments } from "@/db/schema";
import { addMonths, periodMonthOf } from "@/lib/billing";

export type PnlRow = {
  /** "2026-09" */
  period: string;
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
};

/**
 * Income (recorded payments by `paid_on`) minus expenses (by `incurred_on`),
 * per calendar month, most recent last. `months` is how many months back from
 * `asOf` to include (default 12).
 */
export async function monthlyPnl(
  gymId: string,
  opts: { months?: number; asOf?: Date } = {},
): Promise<PnlRow[]> {
  const months = opts.months ?? 12;
  const asOf = opts.asOf ?? new Date();
  const current = periodMonthOf(asOf);
  const from = addMonths(current, -(months - 1));
  const to = asOf.toISOString().slice(0, 10);

  const [incomeRows, expenseRows] = await Promise.all([
    db
      .select({
        m: sql<string>`to_char(date_trunc('month', ${payments.paidOn}), 'YYYY-MM')`,
        v: sql<number>`coalesce(sum(${payments.amountPaise}), 0)::bigint`,
      })
      .from(payments)
      .where(and(eq(payments.gymId, gymId), between(payments.paidOn, from, to)))
      .groupBy(sql`date_trunc('month', ${payments.paidOn})`),
    db
      .select({
        m: sql<string>`to_char(date_trunc('month', ${expenses.incurredOn}), 'YYYY-MM')`,
        v: sql<number>`coalesce(sum(${expenses.amountPaise}), 0)::bigint`,
      })
      .from(expenses)
      .where(and(eq(expenses.gymId, gymId), between(expenses.incurredOn, from, to)))
      .groupBy(sql`date_trunc('month', ${expenses.incurredOn})`),
  ]);

  const income = new Map(incomeRows.map((r) => [r.m, Number(r.v)]));
  const expense = new Map(expenseRows.map((r) => [r.m, Number(r.v)]));

  const rows: PnlRow[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const period = addMonths(current, -i).slice(0, 7);
    const inc = income.get(period) ?? 0;
    const exp = expense.get(period) ?? 0;
    rows.push({ period, incomePaise: inc, expensePaise: exp, netPaise: inc - exp });
  }
  return rows;
}

export type PnlTotals = { incomePaise: number; expensePaise: number; netPaise: number };

export function sumPnl(rows: PnlRow[]): PnlTotals {
  return rows.reduce<PnlTotals>(
    (acc, r) => ({
      incomePaise: acc.incomePaise + r.incomePaise,
      expensePaise: acc.expensePaise + r.expensePaise,
      netPaise: acc.netPaise + r.netPaise,
    }),
    { incomePaise: 0, expensePaise: 0, netPaise: 0 },
  );
}
