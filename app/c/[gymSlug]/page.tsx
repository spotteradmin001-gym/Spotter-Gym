import Link from "next/link";
import { redirect } from "next/navigation";

import { getGymBySlug, getSessionUser } from "@/db/queries";
import { readSessionCookie } from "@/src/features/auth/session-cookie";

import { CheckinClient } from "./checkin-client";

export const dynamic = "force-dynamic";

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymSlug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { gymSlug } = await params;
  const { t } = await searchParams;

  const gym = await getGymBySlug(gymSlug);
  const user = await getSessionUser(await readSessionCookie());

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/c/${gymSlug}?t=${t ?? ""}`)}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-lg font-semibold">{gym?.name ?? "Check in"}</h1>
      {!gym ? (
        <p className="text-sm text-destructive">Gym not found.</p>
      ) : user!.role !== "member" ? (
        <p className="text-sm text-muted">
          Check-in is for members. <Link href="/dashboard" className="text-primary underline">Go to your dashboard</Link>.
        </p>
      ) : !t ? (
        <p className="text-sm text-destructive">
          Scan the QR code at the gym — this link is missing its code.
        </p>
      ) : (
        <CheckinClient gymSlug={gymSlug} token={t} />
      )}
    </main>
  );
}
