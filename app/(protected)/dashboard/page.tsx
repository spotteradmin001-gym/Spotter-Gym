import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin/gyms");
  if (user.role === "owner") redirect("/owner");

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Signed in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted">Email:</span> {user.email}
          </p>
          <p>
            <span className="text-muted">Role:</span> {user.role}
          </p>
          <p className="pt-2 text-muted">
            Your role&apos;s workspace is built in a later phase.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
