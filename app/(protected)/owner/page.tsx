import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getGym,
  ownerOverview,
  ownerPromotionCounters,
  reminderCounts,
} from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function OwnerOverviewPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();

  const [gym, overview, reminders, promos] = await Promise.all([
    getGym(user.gymId),
    ownerOverview(user.gymId),
    reminderCounts(user.gymId),
    ownerPromotionCounters(user.gymId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{gym?.name ?? "Your gym"}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile
            label="This month, net"
            value={formatPaise(overview.monthProfitPaise)}
            tone={overview.monthProfitPaise < 0 ? "bad" : "good"}
          />
          <Tile label="Yet to receive" value={formatPaise(overview.outstandingPaise)} />
          <Tile label="Due today" value={formatPaise(overview.dueTodayPaise)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <Tile label="Sent today" value={String(reminders.sentToday)} />
          <Tile label="Pending" value={String(reminders.pending)} />
          <Tile
            label="Failed"
            value={String(reminders.failed)}
            tone={reminders.failed > 0 ? "bad" : undefined}
          />
        </CardContent>
      </Card>

      {(promos.inFlight > 0 || promos.refundDue > 0) && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Promotions</CardTitle>
            <Link
              href="/owner/promotions"
              className="text-sm text-primary hover:underline"
            >
              View
            </Link>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="In flight" value={String(promos.inFlight)} />
            <Tile
              label="Needs your action"
              value={String(promos.needsOwnerAction)}
              tone={promos.needsOwnerAction > 0 ? "bad" : undefined}
            />
            <Tile label="Sending" value={String(promos.sending)} />
            <Tile
              label="Refund due to you"
              value={String(promos.refundDue)}
              tone={promos.refundDue > 0 ? "good" : undefined}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Active" value={String(overview.members.activeTotal)} />
          <Tile label="Joined this month" value={String(overview.members.joinedThisMonth)} />
          <Tile
            label="Joined last 3 months"
            value={String(overview.members.joinedLast3Months)}
          />
          <Tile
            label="Not renewed this month"
            value={String(overview.members.notRenewedThisMonth)}
            tone={overview.members.notRenewedThisMonth > 0 ? "bad" : undefined}
          />
          <Tile
            label="Not renewed last 3 months"
            value={String(overview.members.notRenewedLast3Months)}
            tone={overview.members.notRenewedLast3Months > 0 ? "bad" : undefined}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted">
        &ldquo;Not renewed&rdquo; = still an active member with a due whose date
        has passed and is unpaid.
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex flex-col rounded-md border border-border p-3">
      <span className="text-xs text-muted">{label}</span>
      <span
        className={
          tone === "bad"
            ? "text-lg font-semibold text-destructive"
            : tone === "good"
              ? "text-lg font-semibold text-success"
              : "text-lg font-semibold"
        }
      >
        {value}
      </span>
    </div>
  );
}
