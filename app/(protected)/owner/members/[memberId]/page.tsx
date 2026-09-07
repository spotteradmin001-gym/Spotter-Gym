import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMember, listProfileFields } from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

import { setMemberStatusAction } from "../actions";
import { EditMemberForm, MemberFeeForm } from "./member-forms";

export const dynamic = "force-dynamic";

export default async function OwnerMemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { memberId } = await params;

  const [member, fields] = await Promise.all([
    getMember(user.gymId, memberId),
    listProfileFields(user.gymId),
  ]);
  if (!member) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/owner/members" className="text-sm text-primary hover:underline">
        ← All members
      </Link>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{member.name}</CardTitle>
          <form action={setMemberStatusAction}>
            <input type="hidden" name="id" value={member.id} />
            <input
              type="hidden"
              name="status"
              value={member.status === "active" ? "inactive" : "active"}
            />
            <Button type="submit" variant="secondary" size="sm">
              {member.status === "active" ? "Mark inactive" : "Mark active"}
            </Button>
          </form>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Field label="Phone" value={member.phone} />
          <Field label="Email" value={member.email ?? "—"} />
          <Field label="Joined" value={member.joinDate} />
          <Field
            label="Fee"
            value={`${formatPaise(member.resolvedFeePaise)}${
              member.monthlyFeePaise == null ? " (gym default)" : ""
            }`}
          />
          <Field label="Billing day" value={String(member.billingAnchorDay)} />
          <Field label="Status" value={member.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <EditMemberForm member={member} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fee</CardTitle>
        </CardHeader>
        <CardContent>
          <MemberFeeForm member={member} />
        </CardContent>
      </Card>

      {fields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2 text-sm">
            {fields.map((f) => (
              <Field
                key={f.id}
                label={f.label}
                value={member.profile[f.key] ?? "—"}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dues, payments & attendance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          Shown here once billing (Batch 3.3 / 3.4) and check-in (Phase 5) land.
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
