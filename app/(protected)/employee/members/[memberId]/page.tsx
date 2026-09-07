import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMember, listPermissionsForUser } from "@/db/queries";
import { requireEmployee } from "@/src/features/auth/guards";

import { EditMemberForm } from "../../forms";

export const dynamic = "force-dynamic";

export default async function EmployeeMemberEditPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const user = await requireEmployee();
  if (!user.gymId) notFound();
  const { memberId } = await params;

  const perms = await listPermissionsForUser(user.id);
  if (!perms.some((p) => p.permission === "member.edit")) {
    redirect("/employee/members");
  }

  const member = await getMember(user.gymId, memberId);
  if (!member) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/employee/members" className="text-sm text-primary hover:underline">
        ← All members
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{member.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <EditMemberForm member={member} />
        </CardContent>
      </Card>
    </div>
  );
}
