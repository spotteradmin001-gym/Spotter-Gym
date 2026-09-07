import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGym } from "@/db/queries";
import { requireOwner } from "@/src/features/auth/guards";

import { QrDisplay } from "./qr-display";

export const dynamic = "force-dynamic";

export default async function OwnerCheckinQrPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const gym = await getGym(user.gymId);
  if (!gym) notFound();

  const geoSet = gym.geoLat != null && gym.geoLng != null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check-in QR</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {!geoSet ? (
          <p className="text-sm text-destructive">
            Set the gym&apos;s check-in latitude / longitude in{" "}
            <Link href="/owner/settings" className="underline">
              Settings
            </Link>{" "}
            first — check-in is location-locked.
          </p>
        ) : (
          <QrDisplay slug={gym.slug} />
        )}
      </CardContent>
    </Card>
  );
}
