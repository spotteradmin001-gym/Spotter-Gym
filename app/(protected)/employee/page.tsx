import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGym } from "@/db/queries";
import { requireEmployee } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function EmployeeHomePage() {
  const user = await requireEmployee();
  const gym = user.gymId ? await getGym(user.gymId) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{gym?.name ?? "Your gym"}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted">
        Use the tabs above for the tasks your owner has granted you. Actions
        marked &ldquo;needs approval&rdquo; are queued for the owner.
      </CardContent>
    </Card>
  );
}
