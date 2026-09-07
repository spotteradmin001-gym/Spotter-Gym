import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/db/queries";
import { readSessionCookie } from "@/src/features/auth/session-cookie";

import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await getSessionUser(await readSessionCookie());
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {user.mustChangePassword ? "Set a new password" : "Change your password"}
          </CardTitle>
          <CardDescription>
            {user.mustChangePassword
              ? "You're signing in with a temporary password. Choose a new one to continue."
              : "Enter your current password and a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}
