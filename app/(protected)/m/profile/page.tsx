import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listProfileFields, profileComplete } from "@/db/queries";
import { requireMemberSelf } from "@/src/features/auth/member-scope";

import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function MemberProfilePage() {
  const { member } = await requireMemberSelf();
  const fields = await listProfileFields(member.gymId);
  const complete = profileComplete(member.profile, fields);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your profile</CardTitle>
        <CardDescription>
          {complete
            ? "Update your details any time."
            : "Fill in the required fields to finish setting up."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-muted">
            Your gym hasn&apos;t asked for any extra details.
          </p>
        ) : (
          <ProfileForm fields={fields} values={member.profile} />
        )}
      </CardContent>
    </Card>
  );
}
