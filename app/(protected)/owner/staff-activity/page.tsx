import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listEmployees, listStaffActivity } from "@/db/queries";
import type { RangeKind } from "@/lib/billing";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

const PERIODS: { key: RangeKind; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "Last 12 months" },
];

/** Human labels for the allow-listed audit actions this page surfaces. */
const ACTION_LABELS: Record<string, string> = {
  "payment.record": "Recorded a payment",
  "member.create": "Added a member",
  "member.edit": "Edited a member",
  "member.status": "Changed a member's status",
  "expense.create": "Added an expense",
  "expense.edit": "Edited an expense",
  "permission_request.filed": "Filed an approval request",
  "approval.approved": "Approved a request",
  "approval.rejected": "Rejected a request",
};

export default async function OwnerStaffActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; employee?: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const gymId = user.gymId;

  const { period, employee } = await searchParams;
  const range: RangeKind =
    period === "quarter" || period === "year" ? period : "month";

  const employees = await listEmployees(gymId);
  const employeeUserId =
    employee && employees.some((e) => e.userId === employee)
      ? employee
      : undefined;

  const rows = await listStaffActivity(gymId, {
    period: range,
    employeeUserId,
  });

  const nameByUserId = new Map(employees.map((e) => [e.userId, e.name]));
  const periodHref = (key: RangeKind) => {
    const params = new URLSearchParams({ period: key });
    if (employeeUserId) params.set("employee", employeeUserId);
    return `/owner/staff-activity?${params.toString()}`;
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>Staff activity ({rows.length})</CardTitle>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex gap-3">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={periodHref(p.key)}
                className={
                  p.key === range
                    ? "font-semibold"
                    : "text-muted hover:text-primary"
                }
              >
                {p.label}
              </Link>
            ))}
          </div>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="period" value={range} />
            <Select
              name="employee"
              defaultValue={employeeUserId ?? ""}
              className="h-8 w-44"
              aria-label="Filter by employee"
            >
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.userId} value={e.userId}>
                  {e.name}
                </option>
              ))}
            </Select>
            <button
              type="submit"
              className="text-sm text-primary hover:underline"
            >
              Apply
            </button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">
            No staff activity in this period.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Employee</TH>
                <TH>Action</TH>
                <TH>Target</TH>
                <TH>Amount</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </TD>
                  <TD>
                    {r.actorName ??
                      (r.actorUserId
                        ? nameByUserId.get(r.actorUserId)
                        : null) ??
                      r.actorEmail ??
                      "—"}
                  </TD>
                  <TD>{ACTION_LABELS[r.action] ?? r.action}</TD>
                  <TD className="text-muted">
                    {r.targetType === "member" && r.targetId ? (
                      <Link
                        href={`/owner/members/${r.targetId}`}
                        className="text-primary hover:underline"
                      >
                        member
                      </Link>
                    ) : (
                      r.targetType
                    )}
                  </TD>
                  <TD>{r.amountPaise == null ? "—" : formatPaise(r.amountPaise)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
