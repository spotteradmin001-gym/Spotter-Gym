import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CredentialControls } from "@/components/credential-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { WaContactLink } from "@/components/wa-contact-link";
import { countGymUsersByRole, getGym, listGymUsers } from "@/db/queries";
import { isCredentialVaultEnabled } from "@/lib/credential-crypto";

import {
  resetOwnerPasswordAction,
  revealOwnerPasswordAction,
  setGymActiveAction,
  setUserActiveAction,
} from "../../actions";
import { CreateOwnerForm } from "./create-owner-form";
import { WahaLimitsForm } from "./waha-limits-form";
import { WahaSessionForm } from "./waha-session-form";

export const dynamic = "force-dynamic";

export default async function AdminGymDetailPage({
  params,
}: {
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;
  const gym = await getGym(gymId);
  if (!gym) notFound();

  const [counts, owners] = await Promise.all([
    countGymUsersByRole(gymId),
    listGymUsers(gymId, "owner"),
  ]);
  const vaultEnabled = isCredentialVaultEnabled();

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/gyms" className="text-sm text-primary hover:underline">
        ← All gyms
      </Link>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>{gym.name}</CardTitle>
          <form action={setGymActiveAction}>
            <input type="hidden" name="id" value={gym.id} />
            <input type="hidden" name="isActive" value={String(!gym.isActive)} />
            <Button type="submit" variant="secondary" size="sm">
              {gym.isActive ? "Deactivate gym" : "Reactivate gym"}
            </Button>
          </form>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Status" value={gym.isActive ? "Active" : "Inactive"} />
          <Stat label="Timezone" value={gym.timezone} />
          <Stat label="Owners" value={String(counts.owners)} />
          <Stat label="Employees" value={String(counts.employees)} />
          <Stat label="Members" value={String(counts.members)} />
          <Stat label="Slug" value={gym.slug} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
        </CardHeader>
        <CardContent>
          <WahaSessionForm
            gymId={gym.id}
            wahaSessionName={gym.wahaSessionName}
            slug={gym.slug}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WhatsApp sending limits</CardTitle>
        </CardHeader>
        <CardContent>
          <WahaLimitsForm
            gymId={gym.id}
            wahaDailyCap={gym.wahaDailyCap}
            transactionalReserve={gym.transactionalReserve}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owners</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {owners.length === 0 ? (
            <p className="p-4 text-sm text-muted">No owner login yet.</p>
          ) : (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Email</TH>
                  <TH>Contact</TH>
                  <TH>Status</TH>
                  <TH>Last login</TH>
                  <TH>Credentials</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {owners.map((owner) => (
                  <TR key={owner.id}>
                    <TD label="Email">
                      <Link
                        href={`/admin/gyms/${gymId}/users/${owner.id}`}
                        className="text-primary hover:underline"
                      >
                        {owner.email}
                      </Link>
                    </TD>
                    <TD label="Contact">
                      <WaContactLink
                        phone={owner.phone}
                        label={`Message ${owner.email} on WhatsApp`}
                      />
                    </TD>
                    <TD label="Status" className={owner.isActive ? "" : "text-muted"}>
                      {owner.isActive ? "Active" : "Inactive"}
                    </TD>
                    <TD label="Last login">
                      {owner.lastLoginAt
                        ? new Date(owner.lastLoginAt).toLocaleDateString()
                        : "—"}
                    </TD>
                    <TD label="Credentials">
                      <CredentialControls
                        targetUserId={owner.id}
                        targetRole="owner"
                        phone={owner.phone}
                        vaultEnabled={vaultEnabled}
                        revealAction={revealOwnerPasswordAction}
                        resetAction={resetOwnerPasswordAction}
                        extraFields={{ gymId }}
                      />
                    </TD>
                    <TD className="text-right">
                      <form action={setUserActiveAction}>
                        <input type="hidden" name="id" value={owner.id} />
                        <input type="hidden" name="gymId" value={gymId} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={String(!owner.isActive)}
                        />
                        <Button type="submit" variant="ghost" size="sm">
                          {owner.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add an owner login</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateOwnerForm gymId={gymId} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
