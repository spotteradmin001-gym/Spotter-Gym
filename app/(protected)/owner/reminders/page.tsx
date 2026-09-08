import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listReminderJobs, reminderCounts, type ReminderStatus } from "@/db/queries";
import { requireOwner } from "@/src/features/auth/guards";

import { requeueJobAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES: (ReminderStatus | "all")[] = ["all", "pending", "sent", "failed", "skipped"];

export default async function OwnerRemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as ReminderStatus)
    ? (status as ReminderStatus)
    : undefined;

  const [jobs, counts] = await Promise.all([
    listReminderJobs(user.gymId, { status: filter, limit: 200 }),
    reminderCounts(user.gymId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-2 text-sm">
          <Stat label="Sent today" value={counts.sentToday} />
          <Stat label="Pending" value={counts.pending} />
          <Stat label="Failed" value={counts.failed} tone={counts.failed > 0 ? "bad" : undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Log ({jobs.length})</CardTitle>
          <div className="flex gap-3 text-sm">
            {STATUSES.map((s) => (
              <Link
                key={s}
                href={s === "all" ? "/owner/reminders" : `/owner/reminders?status=${s}`}
                className={
                  (s === "all" && !filter) || s === filter
                    ? "font-semibold"
                    : "text-muted hover:text-primary"
                }
              >
                {s}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing here.</p>
          ) : (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Scheduled</TH>
                  <TH>Member</TH>
                  <TH>Kind</TH>
                  <TH>Status</TH>
                  <TH>Sent / error</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {jobs.map((j) => (
                  <TR key={j.id}>
                    <TD label="Scheduled">{j.scheduledFor}</TD>
                    <TD label="Member">
                      <Link
                        href={`/owner/members/${j.memberId}`}
                        className="text-primary hover:underline"
                      >
                        {j.memberName}
                      </Link>
                    </TD>
                    <TD label="Kind">{j.kind}</TD>
                    <TD label="Status" className={j.status === "failed" ? "text-destructive" : j.status === "sent" ? "text-success" : ""}>
                      {j.status}
                      {j.attempts > 0 && ` (${j.attempts})`}
                    </TD>
                    <TD label="Sent / error" className="text-muted">
                      {j.sentAt
                        ? new Date(j.sentAt).toLocaleString()
                        : j.error ?? "—"}
                    </TD>
                    <TD className="text-right">
                      {j.status !== "sent" && (
                        <form action={requeueJobAction}>
                          <input type="hidden" name="jobId" value={j.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Re-queue
                          </Button>
                        </form>
                      )}
                    </TD>
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "bad";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className={tone === "bad" ? "font-semibold text-destructive" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}
