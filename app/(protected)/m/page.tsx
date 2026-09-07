import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGym } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireCompleteProfile } from "@/src/features/auth/member-scope";

export const dynamic = "force-dynamic";

export default async function MemberHomePage() {
  const { member } = await requireCompleteProfile();
  const gym = await getGym(member.gymId);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Hi {member.name.split(" ")[0]}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p><span className="text-muted">Gym:</span> {gym?.name}</p>
          <p><span className="text-muted">Monthly fee:</span> {formatPaise(member.resolvedFeePaise)}</p>
          <p className="pt-2 text-muted">
            Check-in and streak arrive next. Dues are on the Payments tab.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
