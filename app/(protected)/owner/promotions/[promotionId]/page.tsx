import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  getPromotionForGym,
  listPromotionRecipients,
  promotionRecipientTally,
} from "@/db/queries";
import { formatPaise } from "@/lib/money";
import {
  PROMOTION_SETTLEMENT_LABEL,
  PROMOTION_STATUS_LABEL,
} from "@/lib/promo-status";
import { requireOwner } from "@/src/features/auth/guards";

import {
  approveEstimateAction,
  cancelPromotionAction,
  markPrepaidAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function OwnerPromotionDetailPage({
  params,
}: {
  params: Promise<{ promotionId: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { promotionId } = await params;

  const promo = await getPromotionForGym(user.gymId, promotionId);
  if (!promo) notFound();

  const [recipients, tally] = await Promise.all([
    listPromotionRecipients(promotionId),
    promotionRecipientTally(promotionId),
  ]);

  const canApproveEstimate = promo.status === "priced";
  const canMarkPrepaid =
    promo.status === "approved" && promo.prepaidPaise == null;
  const waitingForAdminPayment =
    promo.status === "approved" && promo.prepaidPaise != null;
  const canCancel = ["draft", "submitted", "priced", "approved"].includes(
    promo.status,
  );

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/owner/promotions"
        className="text-sm text-primary hover:underline"
      >
        Back to promotions
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{PROMOTION_STATUS_LABEL[promo.status]}</CardTitle>
          <p className="text-sm text-muted">
            Created {new Date(promo.createdAt).toLocaleString()} ·{" "}
            {PROMOTION_SETTLEMENT_LABEL[promo.settlement] ?? promo.settlement}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {promo.pauseReason && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              Paused: {promo.pauseReason}
            </p>
          )}
          {promo.adminNote && (
            <p className="rounded-md border border-border bg-muted-background p-3 text-sm">
              Admin note: {promo.adminNote}
            </p>
          )}

          <div>
            <p className="text-sm font-medium">Message</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
              {promo.body || "(no text part)"}
            </p>
          </div>
          <p className="text-sm">
            Image: {promo.hasImage ? `yes (${promo.imageMime ?? "image"})` : "no"}
          </p>

          <div className="flex flex-wrap gap-2">
            {canApproveEstimate && (
              <form action={approveEstimateAction}>
                <input type="hidden" name="promotionId" value={promo.id} />
                <Button type="submit" size="sm">
                  Approve estimate ({formatPaise(promo.estimatedTotalPaise)})
                </Button>
              </form>
            )}
            {canMarkPrepaid && (
              <form action={markPrepaidAction}>
                <input type="hidden" name="promotionId" value={promo.id} />
                <Button type="submit" size="sm">
                  I have prepaid {formatPaise(promo.estimatedTotalPaise)}
                </Button>
              </form>
            )}
            {canCancel && (
              <form action={cancelPromotionAction}>
                <input type="hidden" name="promotionId" value={promo.id} />
                <Button type="submit" size="sm" variant="secondary">
                  Cancel
                </Button>
              </form>
            )}
          </div>
          {waitingForAdminPayment && (
            <p className="text-sm text-muted">
              Prepayment of {formatPaise(promo.prepaidPaise)} recorded. Waiting
              for the admin to confirm the money and start the send.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Stat label="Per message" value={formatPaise(promo.perMessagePaise)} />
          <Stat label="Estimate" value={formatPaise(promo.estimatedTotalPaise)} />
          <Stat label="Prepaid" value={formatPaise(promo.prepaidPaise)} />
          <Stat label="Billed" value={formatPaise(promo.billedTotalPaise)} />
          <Stat label="Refund due" value={formatPaise(promo.refundPaise)} />
          <Stat label="Delivered parts" value={String(tally.deliveredParts)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recipients ({tally.total})</CardTitle>
          <p className="text-sm text-muted">
            Text — sent {tally.textSent}, failed {tally.textFailed}, skipped{" "}
            {tally.textSkipped}, pending {tally.textPending}. Image — sent{" "}
            {tally.imageSent}, failed {tally.imageFailed}, skipped{" "}
            {tally.imageSkipped}, pending {tally.imagePending}.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table variant="stacked">
            <THead>
              <TR>
                <TH>Phone</TH>
                <TH>Source</TH>
                <TH>On WhatsApp</TH>
                <TH>Text</TH>
                <TH>Image</TH>
              </TR>
            </THead>
            <TBody>
              {recipients.map((r) => (
                <TR key={r.id}>
                  <TD label="Phone" className="font-mono text-xs">
                    {r.phone}
                  </TD>
                  <TD label="Source">{r.source}</TD>
                  <TD label="On WhatsApp">
                    {r.waExists == null ? "—" : r.waExists ? "yes" : "no"}
                  </TD>
                  <TD label="Text">{r.textStatus}</TD>
                  <TD label="Image">{r.imageStatus}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
