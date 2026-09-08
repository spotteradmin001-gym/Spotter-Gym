import Link from "next/link";
import { notFound } from "next/navigation";

import { monthLabel } from "@/components/treasure-chest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  listMembers,
  listPayments,
  listPendingStreakRewardsForGym,
  paymentsSummary,
} from "@/db/queries";
import type { RangeKind } from "@/lib/billing";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

import { RecordPaymentForm } from "./record-payment-form";

export const dynamic = "force-dynamic";

const PERIODS: { key: RangeKind; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "Last 12 months" },
];

export default async function OwnerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { period } = await searchParams;
  const range: RangeKind =
    period === "quarter" || period === "year" ? period : "month";

  const [summary, list, members, pendingRewards] = await Promise.all([
    paymentsSummary(user.gymId, { period: range }),
    listPayments(user.gymId, { period: range }),
    listMembers(user.gymId, { status: "active" }),
    listPendingStreakRewardsForGym(user.gymId),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Record a payment</CardTitle>
        </CardHeader>
        <CardContent>
          <RecordPaymentForm
            today={today}
            members={members.map((m) => ({ id: m.id, name: m.name }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex gap-3 text-sm">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/owner/payments?period=${p.key}`}
                className={p.key === range ? "font-semibold" : "text-muted hover:text-primary"}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <a
            href={`/owner/payments/export?period=${range}`}
            className="text-sm text-primary hover:underline"
          >
            Export CSV
          </a>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 text-sm">
          <Stat label="Collected (period)" value={formatPaise(summary.collectedPaise)} />
          <Stat label="Yet to receive" value={formatPaise(summary.outstandingPaise)} />
          <Stat label="Due today" value={formatPaise(summary.dueTodayPaise)} />
        </CardContent>
      </Card>

      {pendingRewards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Streak rewards pending ({pendingRewards.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Member</TH>
                  <TH>Discount</TH>
                  <TH>Applies to</TH>
                </TR>
              </THead>
              <TBody>
                {pendingRewards.map((r) => (
                  <TR key={r.id}>
                    <TD label="Member">
                      <Link
                        href={`/owner/members/${r.memberId}`}
                        className="text-primary hover:underline"
                      >
                        {r.memberName}
                      </Link>
                    </TD>
                    <TD label="Discount">{r.percent}% off</TD>
                    <TD label="Applies to">
                      {monthLabel(r.redeemPeriod) ?? r.redeemPeriod}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payments ({list.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <p className="p-4 text-sm text-muted">No payments in this period.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Member</TH>
                  <TH>Amount</TH>
                  <TH>Method</TH>
                  <TH>Note</TH>
                </TR>
              </THead>
              <TBody>
                {list.map((p) => (
                  <TR key={p.id}>
                    <TD>{p.paidOn}</TD>
                    <TD>
                      <Link
                        href={`/owner/members/${p.memberId}`}
                        className="text-primary hover:underline"
                      >
                        {p.memberName}
                      </Link>
                    </TD>
                    <TD>{formatPaise(p.amountPaise)}</TD>
                    <TD>{p.method}</TD>
                    <TD className="text-muted">{p.note ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
