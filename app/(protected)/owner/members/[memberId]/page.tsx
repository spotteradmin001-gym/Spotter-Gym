import Link from "next/link";
import { notFound } from "next/navigation";

import { CredentialControls } from "@/components/credential-controls";
import { monthLabel } from "@/components/treasure-chest";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { WaContactLink } from "@/components/wa-contact-link";
import {
  getMember,
  listDuesForMember,
  listPayments,
  listProfileFields,
  listRecentCheckins,
  listReminderJobs,
  listStreakRewardsForMember,
} from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

import { RecordPaymentForm } from "../../payments/record-payment-form";
import { resetMemberPasswordAction, setMemberStatusAction } from "../actions";
import { ActivationPanel } from "./activation-panel";
import { EditMemberForm, MemberFeeForm } from "./member-forms";
import { SendReminderNow } from "./send-reminder";

export const dynamic = "force-dynamic";

export default async function OwnerMemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { memberId } = await params;

  const [
    member,
    fields,
    memberDues,
    memberPayments,
    checkins,
    reminders,
    streakRewards,
  ] = await Promise.all([
    getMember(user.gymId, memberId),
    listProfileFields(user.gymId),
    listDuesForMember(user.gymId, memberId),
    listPayments(user.gymId, { memberId }),
    listRecentCheckins(user.gymId, memberId, 20),
    listReminderJobs(user.gymId, { memberId, limit: 20 }),
    listStreakRewardsForMember(user.gymId, memberId),
  ]);
  if (!member) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <Link href="/owner/members" className="text-sm text-primary hover:underline">
        ← All members
      </Link>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
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
          <div className="flex flex-col">
            <span className="text-xs text-muted">Phone</span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              {member.phone}
              <WaContactLink
                phone={member.phone}
                label={`Message ${member.name} on WhatsApp`}
              />
            </span>
          </div>
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
          <CardTitle>Member login</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ActivationPanel memberId={member.id} activated={member.userId != null} />
          {member.userId != null && (
            <div className="border-t border-border pt-3">
              <CredentialControls
                targetUserId={member.userId}
                targetRole="member"
                phone={member.phone}
                vaultEnabled={false}
                resetAction={resetMemberPasswordAction}
                extraFields={{ memberId: member.id }}
              />
            </div>
          )}
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
            <Table variant="stacked">
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
                    <TD label="Period">{d.periodMonth.slice(0, 7)}</TD>
                    <TD label="Due date">{d.dueDate}</TD>
                    <TD label="Amount">{formatPaise(d.amountDuePaise)}</TD>
                    <TD label="Status" className={d.status === "pending" ? "" : "text-muted"}>
                      {d.status}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {streakRewards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Streak rewards</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Earned cycle</TH>
                  <TH>Discount</TH>
                  <TH>Applies to</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {streakRewards.map((r) => (
                  <TR key={r.id}>
                    <TD label="Earned cycle">
                      {monthLabel(r.earnedPeriod) ?? r.earnedPeriod}
                    </TD>
                    <TD label="Discount">{r.percent}% off</TD>
                    <TD label="Applies to">
                      {monthLabel(r.redeemPeriod) ?? r.redeemPeriod}
                    </TD>
                    <TD
                      label="Status"
                      className={
                        r.status === "missed"
                          ? "text-muted"
                          : r.status === "applied"
                            ? "text-success"
                            : ""
                      }
                    >
                      {r.status}
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
            <Table variant="stacked">
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
                    <TD label="Date">{p.paidOn}</TD>
                    <TD label="Amount">{formatPaise(p.amountPaise)}</TD>
                    <TD label="Method">{p.method}</TD>
                    <TD label="Note" className="text-muted">{p.note ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SendReminderNow memberId={member.id} />
          {reminders.length > 0 && (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Scheduled</TH>
                  <TH>Kind</TH>
                  <TH>Status</TH>
                  <TH>Sent / error</TH>
                </TR>
              </THead>
              <TBody>
                {reminders.map((r) => (
                  <TR key={r.id}>
                    <TD label="Scheduled">{r.scheduledFor}</TD>
                    <TD label="Kind">{r.kind}</TD>
                    <TD
                      label="Status"
                      className={
                        r.status === "failed"
                          ? "text-destructive"
                          : r.status === "sent"
                            ? "text-success"
                            : ""
                      }
                    >
                      {r.status}
                    </TD>
                    <TD label="Sent / error" className="text-muted">
                      {r.sentAt
                        ? new Date(r.sentAt).toLocaleString()
                        : r.error ?? "—"}
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
          <CardTitle>Attendance ({checkins.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {checkins.length === 0 ? (
            <p className="p-4 text-sm text-muted">No check-ins yet.</p>
          ) : (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Distance</TH>
                </TR>
              </THead>
              <TBody>
                {checkins.map((c) => (
                  <TR key={c.date}>
                    <TD label="Date">{c.date}</TD>
                    <TD label="Distance">{c.distanceM == null ? "—" : `${c.distanceM} m`}</TD>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
