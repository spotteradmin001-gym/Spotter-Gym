import Link from "next/link";
import { notFound } from "next/navigation";

import { PromotionComposeForm } from "@/components/promotions/promotion-compose-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listMembers } from "@/db/queries";
import { isPromoMediaEnabled } from "@/lib/promo-media";
import { requireOwner } from "@/src/features/auth/guards";

import { composePromotionAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function OwnerComposePromotionPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();

  const members = await listMembers(user.gymId);
  const options = members.map((m) => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    status: m.status,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>New promotion</CardTitle>
        <Link
          href="/owner/promotions"
          className="text-sm text-primary hover:underline"
        >
          Back to promotions
        </Link>
      </CardHeader>
      <CardContent>
        <PromotionComposeForm
          members={options}
          mediaEnabled={isPromoMediaEnabled()}
          action={composePromotionAction}
          submitLabel="Send to admin review"
        />
      </CardContent>
    </Card>
  );
}
