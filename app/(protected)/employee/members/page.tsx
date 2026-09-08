import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listMembers, listPermissionsForUser } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireEmployee } from "@/src/features/auth/guards";

import { AddMemberForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function EmployeeMembersPage() {
  const user = await requireEmployee();
  if (!user.gymId) notFound();

  const perms = await listPermissionsForUser(user.id);
  const held = new Set(perms.map((p) => p.permission));
  const canCreate = held.has("member.create");
  const canEdit = held.has("member.edit");
  // Reading the member list (PII) needs a member permission, not just an
  // employee login.
  if (!canCreate && !canEdit) redirect("/employee");

  const members = await listMembers(user.gymId);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Add a member</CardTitle>
          </CardHeader>
          <CardContent>
            <AddMemberForm today={today} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Phone</TH>
                <TH>Fee</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD>
                    {canEdit ? (
                      <Link
                        href={`/employee/members/${m.id}`}
                        className="text-primary hover:underline"
                      >
                        {m.name}
                      </Link>
                    ) : (
                      m.name
                    )}
                  </TD>
                  <TD>{m.phone}</TD>
                  <TD>{formatPaise(m.resolvedFeePaise)}</TD>
                  <TD className={m.status === "active" ? "" : "text-muted"}>
                    {m.status}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
