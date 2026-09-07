import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listMembers, type MemberStatus } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

import { regenerateDuesAction } from "./actions";
import { AddMemberForm } from "./add-member-form";

export const dynamic = "force-dynamic";

export default async function OwnerMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { q, status } = await searchParams;
  const statusFilter: MemberStatus | undefined =
    status === "active" || status === "inactive" ? status : undefined;

  const members = await listMembers(user.gymId, {
    search: q,
    status: statusFilter,
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a member</CardTitle>
        </CardHeader>
        <CardContent>
          <AddMemberForm today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>Members ({members.length})</CardTitle>
            <form action={regenerateDuesAction}>
              <Button type="submit" variant="ghost" size="sm">
                Regenerate dues
              </Button>
            </form>
          </div>
          <form className="flex gap-2" method="get">
            <Input
              name="q"
              placeholder="Search name / phone"
              defaultValue={q ?? ""}
              className="h-8 w-44"
            />
            <Select name="status" defaultValue={status ?? ""} className="h-8 w-32">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <p className="p-4 text-sm text-muted">No members match.</p>
          ) : (
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
                      <Link
                        href={`/owner/members/${m.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {m.name}
                      </Link>
                    </TD>
                    <TD>{m.phone}</TD>
                    <TD>
                      {formatPaise(m.resolvedFeePaise)}
                      {m.monthlyFeePaise == null && (
                        <span className="ml-1 text-xs text-muted">(default)</span>
                      )}
                    </TD>
                    <TD className={m.status === "active" ? "" : "text-muted"}>
                      {m.status}
                    </TD>
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
