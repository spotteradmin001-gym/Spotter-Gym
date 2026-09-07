import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser, peekActivationToken } from "@/db/queries";
import { readSessionCookie } from "@/src/features/auth/session-cookie";

import { ActivateForm } from "./activate-form";

export const dynamic = "force-dynamic";

export default async function ActivatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await getSessionUser(await readSessionCookie());
  if (user) redirect("/dashboard");

  const peek = await peekActivationToken(token);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Set up your Spotter login</CardTitle>
          <CardDescription>
            {peek
              ? `Welcome, ${peek.memberName}. Choose an email and password.`
              : "This link is invalid or has expired. Ask your gym for a new one."}
          </CardDescription>
        </CardHeader>
        {peek && (
          <CardContent>
            <ActivateForm token={token} defaultEmail={peek.memberEmail ?? ""} />
          </CardContent>
        )}
      </Card>
    </main>
  );
}
