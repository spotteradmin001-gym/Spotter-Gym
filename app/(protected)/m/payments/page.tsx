import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listDuesForMember, listPayments, summariseMemberDues } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireCompleteProfile } from "@/src/features/auth/member-scope";

export const dynamic = "force-dynamic";

export default async function MemberPaymentsPage() {
  const { member } = await requireCompleteProfile();
  const [dues, payments] = await Promise.all([
    listDuesForMember(member.gymId, member.id),
    listPayments(member.gymId, { memberId: member.id }),
  ]);
  const overview = summariseMemberDues(dues);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>What you owe</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted">Outstanding:</span>{" "}
            {formatPaise(overview.pendingPaise)}
          </p>
          {overview.nextDue ? (
            <p>
              <span className="text-muted">Next due:</span>{" "}
              {formatPaise(overview.nextDue.amountDuePaise)} on{" "}
              {overview.nextDue.dueDate}
            </p>
          ) : (
            <p className="text-success">All paid up.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dues</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {dues.length === 0 ? (
            <p className="p-4 text-sm text-muted">No dues yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Month</TH>
                  <TH>Due date</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {dues.map((d) => (
                  <TR key={d.id}>
                    <TD>{d.periodMonth.slice(0, 7)}</TD>
                    <TD>{d.dueDate}</TD>
                    <TD>{formatPaise(d.amountDuePaise)}</TD>
                    <TD className={d.status === "pending" ? "text-destructive" : "text-muted"}>
                      {d.status}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="p-4 text-sm text-muted">No payments recorded.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Amount</TH>
                  <TH>Method</TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD>{p.paidOn}</TD>
                    <TD>{formatPaise(p.amountPaise)}</TD>
                    <TD>{p.method}</TD>
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
