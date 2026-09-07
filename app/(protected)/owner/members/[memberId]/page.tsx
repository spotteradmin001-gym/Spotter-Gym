import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  getMember,
  listDuesForMember,
  listPayments,
  listProfileFields,
} from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

import { RecordPaymentForm } from "../../payments/record-payment-form";
import { setMemberStatusAction } from "../actions";
import { EditMemberForm, MemberFeeForm } from "./member-forms";

export const dynamic = "force-dynamic";

export default async function OwnerMemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { memberId } = await params;

  const [member, fields, memberDues, memberPayments] = await Promise.all([
    getMember(user.gymId, memberId),
    listProfileFields(user.gymId),
    listDuesForMember(user.gymId, memberId),
    listPayments(user.gymId, { memberId }),
  ]);
  if (!member) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/owner/members" className="text-sm text-primary hover:underline">
        ← All members
      </Link>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{member.name}</CardTitle>
          <form action={setMemberStatusAction}>
            <input type="hidden" name="id" value={member.id} />
            <input
              type="hidden"
              name="status"
              value={member.status === "active" ? "inactive" : "active"}
            />
            <Button type="submit" variant="secondary" size="sm">
              {member.status === "active" ? "Mark inactive" : "Mark active"}
            </Button>
          </form>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Field label="Phone" value={member.phone} />
          <Field label="Email" value={member.email ?? "—"} />
          <Field label="Joined" value={member.joinDate} />
          <Field
            label="Fee"
            value={`${formatPaise(member.resolvedFeePaise)}${
              member.monthlyFeePaise == null ? " (gym default)" : ""
            }`}
          />
          <Field label="Billing day" value={String(member.billingAnchorDay)} />
          <Field label="Status" value={member.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <EditMemberForm member={member} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fee</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberFeeForm member={member} />
        </CardContent>
      </Card>

      {fields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            {fields.map((f) => (
              <Field
                key={f.id}
                label={f.label}
                value={member.profile[f.key] ?? "—"}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dues</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {memberDues.length === 0 ? (
            <p className="p-4 text-sm text-muted">
              No dues yet — use &ldquo;Regenerate dues&rdquo; on the members
              list, or wait for the daily run.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Period</TH>
                  <TH>Due date</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {memberDues.map((d) => (
                  <TR key={d.id}>
                    <TD>{d.periodMonth.slice(0, 7)}</TD>
                    <TD>{d.dueDate}</TD>
                    <TD>{formatPaise(d.amountDuePaise)}</TD>
                    <TD className={d.status === "pending" ? "" : "text-muted"}>
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
          <CardTitle>Record a payment</CardTitle>
        </CardHeader>
        <CardContent>
          <RecordPaymentForm
            today={today}
            fixedMember={{ id: member.id, name: member.name }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {memberPayments.length === 0 ? (
            <p className="p-4 text-sm text-muted">No payments recorded.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Amount</TH>
                  <TH>Method</TH>
                  <TH>Note</TH>
                </TR>
              </THead>
              <TBody>
                {memberPayments.map((p) => (
                  <TR key={p.id}>
                    <TD>{p.paidOn}</TD>
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

      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          Shown here once QR check-in (Phase 5) lands.
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
