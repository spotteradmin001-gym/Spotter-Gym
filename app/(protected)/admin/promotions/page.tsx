import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listPromotionsWithGym, type PromotionWithGym } from "@/db/queries";
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
  const all = await listPromotionsWithGym();
  const open = all.filter((p) =>
    (OPEN_STATUSES as readonly string[]).includes(p.status),
  );
  const closed = all
    .filter((p) => !(OPEN_STATUSES as readonly string[]).includes(p.status))
    .slice(0, 50);

  return (
    <div className="flex flex-col gap-4">
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
