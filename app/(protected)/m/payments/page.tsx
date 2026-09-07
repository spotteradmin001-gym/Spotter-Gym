import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCompleteProfile } from "@/src/features/auth/member-scope";

export const dynamic = "force-dynamic";

export default async function MemberPaymentsPage() {
  await requireCompleteProfile();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments &amp; dues</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted">
        Your dues and payment history land here in the next batch.
      </CardContent>
    </Card>
  );
}
