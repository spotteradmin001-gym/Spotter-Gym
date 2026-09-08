import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  adminPromotionCounters,
  listPromotionsWithGym,
  type PromotionWithGym,
} from "@/db/queries";
import { formatPaise } from "@/lib/money";
import {
  PROMOTION_SETTLEMENT_LABEL,
  PROMOTION_STATUS_LABEL,
} from "@/lib/promo-status";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = [
  "submitted",
  "priced",
  "approved",
  "paid",
  "sending",
] as const;

export default async function AdminPromotionsPage() {
  const [all, counters] = await Promise.all([
    listPromotionsWithGym(),
    adminPromotionCounters(),
  ]);
  const open = all.filter((p) =>
    (OPEN_STATUSES as readonly string[]).includes(p.status),
  );
  const closed = all
    .filter((p) => !(OPEN_STATUSES as readonly string[]).includes(p.status))
    .slice(0, 50);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>In flight</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
          <Counter label="Submitted" value={counters.submitted} highlight />
          <Counter label="Priced" value={counters.priced} />
          <Counter label="Approved" value={counters.approved} />
          <Counter label="Paid" value={counters.paid} highlight />
          <Counter label="Sending" value={counters.sending} />
          <Counter label="Refund due" value={counters.refundDue} highlight />
        </CardContent>
      </Card>

      <PromotionTable
        title={`Queue (${open.length})`}
        rows={open}
        empty="No promotions waiting."
      />
      <PromotionTable
        title="Recent"
        rows={closed}
        empty="Nothing yet."
        showSettlement
      />
    </div>
  );
}

function Counter({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          highlight && value > 0
            ? "text-lg font-semibold text-destructive"
            : "text-lg font-semibold"
        }
      >
        {value}
      </p>
    </div>
  );
}

function PromotionTable({
  title,
  rows,
  empty,
  showSettlement,
}: {
  title: string;
  rows: PromotionWithGym[];
  empty: string;
  showSettlement?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted">{empty}</p>
        ) : (
          <Table variant="stacked">
            <THead>
              <TR>
                <TH>Gym</TH>
                <TH>Created</TH>
                <TH>Parts</TH>
                <TH>Recipients</TH>
                <TH>Per msg</TH>
                <TH>Estimate</TH>
                <TH>Status</TH>
                {showSettlement && <TH>Settlement</TH>}
              </TR>
            </THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.id}>
                  <TD label="Gym">
                    <Link
                      href={`/admin/promotions/${p.id}`}
                      className="text-primary hover:underline"
                    >
                      {p.gymName}
                    </Link>
                  </TD>
                  <TD label="Created">
                    {new Date(p.createdAt).toLocaleDateString()}
                  </TD>
                  <TD label="Parts">
                    {[p.hasText && "Text", p.hasImage && "Image"]
                      .filter(Boolean)
                      .join(" + ") || "—"}
                  </TD>
                  <TD label="Recipients">{p.recipientCount}</TD>
                  <TD label="Per msg">{formatPaise(p.perMessagePaise)}</TD>
                  <TD label="Estimate">{formatPaise(p.estimatedTotalPaise)}</TD>
                  <TD label="Status">{PROMOTION_STATUS_LABEL[p.status]}</TD>
                  {showSettlement && (
                    <TD label="Settlement">
                      {PROMOTION_SETTLEMENT_LABEL[p.settlement] ?? p.settlement}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
