import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { monthlyPnl, sumPnl } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

const SPANS = [
  { months: 3, label: "3 months" },
  { months: 6, label: "6 months" },
  { months: 12, label: "12 months" },
];

export default async function OwnerPnlPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { months: monthsRaw } = await searchParams;
  const months = [3, 6, 12].includes(Number(monthsRaw)) ? Number(monthsRaw) : 6;

  const rows = await monthlyPnl(user.gymId, { months });
  const totals = sumPnl(rows);
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.incomePaise, r.expensePaise)));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Profit &amp; loss</CardTitle>
          <div className="flex gap-3 text-sm">
            {SPANS.map((s) => (
              <Link
                key={s.months}
                href={`/owner/pnl?months=${s.months}`}
                className={s.months === months ? "font-semibold" : "text-muted hover:text-primary"}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 text-sm">
          <Stat label="Income" value={formatPaise(totals.incomePaise)} />
          <Stat label="Expenses" value={formatPaise(totals.expensePaise)} />
          <Stat
            label="Net"
            value={formatPaise(totals.netPaise)}
            tone={totals.netPaise < 0 ? "bad" : "good"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By month</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4">
          {/* Simple paired bars — income above, expense below — no chart lib. */}
          <div className="flex flex-col gap-2" aria-hidden>
            {rows.map((r) => (
              <div key={r.period} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-muted">{r.period}</span>
                <div className="flex-1">
                  <div
                    className="h-2 rounded-sm bg-success"
                    style={{ width: `${(r.incomePaise / scale) * 100}%` }}
                  />
                  <div
                    className="mt-0.5 h-2 rounded-sm bg-destructive"
                    style={{ width: `${(r.expensePaise / scale) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH>Income</TH>
                <TH>Expenses</TH>
                <TH>Net</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.period}>
                  <TD>{r.period}</TD>
                  <TD>{formatPaise(r.incomePaise)}</TD>
                  <TD>{formatPaise(r.expensePaise)}</TD>
                  <TD className={r.netPaise < 0 ? "text-destructive" : ""}>
                    {formatPaise(r.netPaise)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={
          tone === "bad"
            ? "font-semibold text-destructive"
            : tone === "good"
              ? "font-semibold text-success"
              : "font-medium"
        }
      >
        {value}
      </span>
    </div>
  );
}
