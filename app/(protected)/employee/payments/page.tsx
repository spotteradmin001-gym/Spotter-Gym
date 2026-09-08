import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listMembers, listPayments, listPermissionsForUser } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireEmployee } from "@/src/features/auth/guards";

import { RecordPaymentForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function EmployeePaymentsPage() {
  const user = await requireEmployee();
  if (!user.gymId) notFound();

  const perms = await listPermissionsForUser(user.id);
  if (!perms.some((p) => p.permission === "payment.record")) {
    redirect("/employee");
  }

  const [members, payments] = await Promise.all([
    listMembers(user.gymId, { status: "active" }),
    listPayments(user.gymId, { period: "month" }),
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
        <CardHeader>
          <CardTitle>This month ({payments.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table variant="stacked">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Member</TH>
                <TH>Amount</TH>
                <TH>Method</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD label="Date">{p.paidOn}</TD>
                  <TD label="Member">{p.memberName}</TD>
                  <TD label="Amount">{formatPaise(p.amountPaise)}</TD>
                  <TD label="Method">{p.method}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
