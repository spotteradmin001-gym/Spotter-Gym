import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  getGym,
  getPromotion,
  listGymUsers,
  listPromotionRecipients,
  partsPerRecipient,
  promotionRecipientTally,
} from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { ownerContactChoices } from "@/lib/promo-owner-contact";
import {
  PROMOTION_SETTLEMENT_LABEL,
  PROMOTION_STATUS_LABEL,
} from "@/lib/promo-status";
import {
  promotionBillMessage,
  promotionQuoteMessage,
} from "@/lib/wa-templates";

import {
  forcePromotionPaidAction,
  markPromotionPaidAction,
  markPromotionRefundedAction,
  rejectPromotionAction,
  sendPromotionAction,
} from "../actions";
import { PricingForm } from "../pricing-form";
import { OwnerContactPicker } from "./owner-contact-picker";

export const dynamic = "force-dynamic";

export default async function AdminPromotionDetailPage({
  params,
}: {
  params: Promise<{ promotionId: string }>;
}) {
  const { promotionId } = await params;
  const promo = await getPromotion(promotionId);
  if (!promo) notFound();

  const [gym, owners, recipients, tally] = await Promise.all([
    getGym(promo.gymId),
    listGymUsers(promo.gymId, "owner"),
    listPromotionRecipients(promotionId),
    promotionRecipientTally(promotionId),
  ]);

  const gymName = gym?.name ?? "the gym";
  const ownerChoices = ownerContactChoices(owners);
  const ownerPhone = ownerChoices[0]?.phone ?? null;
  const parts = partsPerRecipient({
    hasText: promo.hasText,
    hasImage: promo.hasImage,
  });

  const quoteMessage =
    promo.perMessagePaise != null && promo.estimatedTotalPaise != null
      ? promotionQuoteMessage({
          gymName,
          recipientCount: promo.recipientCount,
          partsPerRecipient: parts,
          perMessagePaise: promo.perMessagePaise,
          estimatedTotalPaise: promo.estimatedTotalPaise,
        })
      : null;

  const billMessage =
    promo.billedTotalPaise != null && promo.perMessagePaise != null
      ? promotionBillMessage({
          gymName,
          deliveredParts: tally.deliveredParts,
          perMessagePaise: promo.perMessagePaise,
          billedTotalPaise: promo.billedTotalPaise,
          prepaidPaise: promo.prepaidPaise ?? 0,
          refundPaise: promo.refundPaise ?? 0,
        })
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/admin/promotions"
        className="text-sm text-primary hover:underline"
      >
        ← All promotions
      </Link>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>{gymName}</CardTitle>
            <p className="text-sm text-muted">
              {PROMOTION_STATUS_LABEL[promo.status]} ·{" "}
              {PROMOTION_SETTLEMENT_LABEL[promo.settlement] ?? promo.settlement} ·
              created {new Date(promo.createdAt).toLocaleString()}
            </p>
          </div>
          <Link
            href={`/admin/gyms/${promo.gymId}`}
            className="text-sm text-primary hover:underline"
          >
            Gym detail
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="text-sm font-medium">Message</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md border border-border bg-muted-background p-3 text-sm">
              {promo.body || "(no text part)"}
            </p>
          </div>
          <p className="text-sm">
            Image part:{" "}
            {promo.hasImage ? `yes — ${promo.imageMime ?? "image"}` : "no"}
          </p>
          <p className="text-sm">
            Owner contact: {ownerPhone ?? "no phone on file"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; settlement</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Stat label="Per message" value={formatPaise(promo.perMessagePaise)} />
            <Stat label="Parts / recipient" value={String(parts)} />
            <Stat label="Recipients" value={String(promo.recipientCount)} />
            <Stat label="Estimate" value={formatPaise(promo.estimatedTotalPaise)} />
            <Stat label="Prepaid" value={formatPaise(promo.prepaidPaise)} />
            <Stat label="Billed" value={formatPaise(promo.billedTotalPaise)} />
            <Stat label="Refund" value={formatPaise(promo.refundPaise)} />
            <Stat label="Delivered parts" value={String(tally.deliveredParts)} />
          </div>

          {promo.status === "submitted" && (
            <PricingForm
              promotionId={promo.id}
              partsPerRecipient={parts}
              recipientCount={promo.recipientCount}
              currentPerMessagePaise={promo.perMessagePaise}
            />
          )}

          {(quoteMessage || billMessage) && (
            <OwnerContactPicker
              choices={ownerChoices}
              quoteMessage={quoteMessage}
              billMessage={billMessage}
            />
          )}

          <div className="flex flex-wrap gap-2">
            {["submitted", "priced", "approved"].includes(promo.status) && (
              <form action={rejectPromotionAction}>
                <input type="hidden" name="promotionId" value={promo.id} />
                <Button type="submit" size="sm" variant="destructive">
                  Reject
                </Button>
              </form>
            )}
            {promo.status === "priced" && promo.estimatedTotalPaise != null && (
              <form action={forcePromotionPaidAction}>
                <input type="hidden" name="promotionId" value={promo.id} />
                <Button type="submit" size="sm">
                  Approve &amp; mark paid on owner&apos;s behalf (
                  {formatPaise(promo.estimatedTotalPaise)})
                </Button>
              </form>
            )}
            {promo.status === "approved" && promo.prepaidPaise != null && (
              <form action={markPromotionPaidAction}>
                <input type="hidden" name="promotionId" value={promo.id} />
                <Button type="submit" size="sm">
                  Mark paid ({formatPaise(promo.prepaidPaise)})
                </Button>
              </form>
            )}
            {promo.status === "paid" && (
              <form action={sendPromotionAction}>
                <input type="hidden" name="promotionId" value={promo.id} />
                <Button type="submit" size="sm">
                  Send
                </Button>
              </form>
            )}
            {promo.settlement === "refund_due" && (
              <form action={markPromotionRefundedAction}>
                <input type="hidden" name="promotionId" value={promo.id} />
                <Button type="submit" size="sm">
                  Mark refunded ({formatPaise(promo.refundPaise)})
                </Button>
              </form>
            )}
          </div>
          {promo.status === "approved" && promo.prepaidPaise == null && (
            <p className="text-sm text-muted">
              Waiting for the owner to mark the estimate as prepaid.
            </p>
          )}
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

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
