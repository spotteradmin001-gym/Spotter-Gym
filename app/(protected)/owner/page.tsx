import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGym } from "@/db/queries";
import { requireOwner } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function OwnerOverviewPage() {
  const user = await requireOwner();
  const gym = user.gymId ? await getGym(user.gymId) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{gym?.name ?? "Your gym"}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted">
        The overview dashboard (profit, dues, member stats) is built in a later
        batch. Start in Settings.
      </CardContent>
    </Card>
  );
}
