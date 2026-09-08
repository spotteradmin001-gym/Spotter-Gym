import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WaContactLink } from "@/components/wa-contact-link";
import { getGym, getUser } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminUserDrillInPage({
  params,
}: {
  params: Promise<{ gymId: string; userId: string }>;
}) {
  const { gymId, userId } = await params;
  const [gym, user] = await Promise.all([getGym(gymId), getUser(userId)]);

  // No cross-gym drill-in: the user must actually belong to the gym in the URL.
  if (!gym || !user || user.gymId !== gymId) notFound();

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/admin/gyms/${gymId}`}
        className="text-sm text-primary hover:underline"
      >
        ← {gym.name}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>{user.email}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Role" value={user.role} />
          <Field label="Status" value={user.isActive ? "Active" : "Inactive"} />
          <div className="flex flex-col">
            <span className="text-xs text-muted">Phone</span>
            <span className="inline-flex items-center gap-1.5 font-medium">
              {user.phone ?? "—"}
              <WaContactLink
                phone={user.phone}
                label={`Message ${user.email} on WhatsApp`}
              />
            </span>
          </div>
          <Field
            label="Must change password"
            value={user.mustChangePassword ? "Yes" : "No"}
          />
          <Field
            label="Last login"
            value={
              user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString()
                : "Never"
            }
          />
          <Field
            label="Created"
            value={new Date(user.createdAt).toLocaleDateString()}
          />
        </CardContent>
      </Card>

      <p className="text-sm text-muted">
        Read-only. The full employee / member record appears here once those
        sections are built.
      </p>
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
