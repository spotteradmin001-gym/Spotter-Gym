import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listPermissionRequests, listPromotionsForGym } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { PROMOTION_STATUS_LABEL } from "@/lib/promo-status";
import { requireOwner } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function OwnerPromotionsPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();

  const [promotions, pending] = await Promise.all([
    listPromotionsForGym(user.gymId),
    listPermissionRequests(user.gymId, "pending"),
  ]);
  const awaitingApproval = pending.filter(
    (r) => r.actionType === "promotion.create",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Promotions ({promotions.length})</CardTitle>
          <Link href="/owner/promotions/compose">
            <Button size="sm">New promotion</Button>
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {awaitingApproval > 0 && (
            <p className="rounded-md border border-border bg-muted-background p-3 text-sm">
              {awaitingApproval} employee submission
              {awaitingApproval === 1 ? "" : "s"} waiting —{" "}
              <Link
                href="/owner/approvals"
                className="text-primary hover:underline"
              >
                review in Approvals
              </Link>
              .
            </p>
          )}

          {promotions.length === 0 ? (
            <p className="text-sm text-muted">No promotions yet.</p>
          ) : (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Created</TH>
                  <TH>Parts</TH>
                  <TH>Recipients</TH>
                  <TH>Estimate</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {promotions.map((p) => (
                  <TR key={p.id}>
                    <TD label="Created">
                      <Link
                        href={`/owner/promotions/${p.id}`}
                        className="text-primary hover:underline"
                      >
                        {new Date(p.createdAt).toLocaleDateString()}
                      </Link>
                    </TD>
                    <TD label="Parts">
                      {[p.hasText && "Text", p.hasImage && "Image"]
                        .filter(Boolean)
                        .join(" + ") || "—"}
                    </TD>
                    <TD label="Recipients">{p.recipientCount}</TD>
                    <TD label="Estimate">
                      {formatPaise(p.estimatedTotalPaise)}
                    </TD>
                    <TD label="Status">{PROMOTION_STATUS_LABEL[p.status]}</TD>
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
