import { notFound, redirect } from "next/navigation";

import { PromotionComposeForm } from "@/components/promotions/promotion-compose-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  listMembers,
  listPermissionsForUser,
  listPromotionsCreatedBy,
} from "@/db/queries";
import { PROMOTION_STATUS_LABEL } from "@/lib/promo-status";
import { isPromoMediaEnabled } from "@/lib/promo-media";
import { requireEmployee } from "@/src/features/auth/guards";

import { composePromotionOrRequestAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeePromotionsPage() {
  const user = await requireEmployee();
  if (!user.gymId) notFound();

  const perms = await listPermissionsForUser(user.id);
  if (!perms.some((p) => p.permission === "promotion.create")) {
    redirect("/employee");
  }

  const members = await listMembers(user.gymId);
  const options = members.map((m) => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    status: m.status,
  }));
  const mine = await listPromotionsCreatedBy(user.gymId, user.id);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>New promotion</CardTitle>
          <p className="text-sm text-muted">
            Composed here, then approved by the gym owner. The owner handles the
            estimate and payment — you can&apos;t start a paid send.
          </p>
        </CardHeader>
        <CardContent>
          <PromotionComposeForm
            members={options}
            mediaEnabled={isPromoMediaEnabled()}
            action={composePromotionOrRequestAction}
            submitLabel="Submit"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your promotions ({mine.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {mine.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing submitted yet.</p>
          ) : (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Created</TH>
                  <TH>Recipients</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {mine.map((p) => (
                  <TR key={p.id}>
                    <TD label="Created">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </TD>
                    <TD label="Recipients">{p.recipientCount}</TD>
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
