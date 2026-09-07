import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/db/queries";
import { readSessionCookie } from "@/src/features/auth/session-cookie";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const user = await getSessionUser(await readSessionCookie());
  if (user) {
    redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  }

  const { changed } = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to Spotter</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {changed && (
            <p className="rounded-md border border-success/40 bg-muted-background p-2 text-sm">
              Password updated — sign in with your new password.
            </p>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
