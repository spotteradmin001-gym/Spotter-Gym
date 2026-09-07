import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listGyms } from "@/db/queries";

import { setGymActiveAction } from "../actions";
import { CreateGymForm } from "./create-gym-form";

export const dynamic = "force-dynamic";

export default async function AdminGymsPage() {
  const gyms = await listGyms({ includeInactive: true });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a gym</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateGymForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gyms ({gyms.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {gyms.length === 0 ? (
            <p className="p-4 text-sm text-muted">No gyms yet.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Timezone</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {gyms.map((gym) => (
                  <TR key={gym.id}>
                    <TD>
                      <Link
                        href={`/admin/gyms/${gym.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {gym.name}
                      </Link>
                      <span className="block text-xs text-muted">{gym.slug}</span>
                    </TD>
                    <TD>{gym.timezone}</TD>
                    <TD>
                      <span className={gym.isActive ? "" : "text-muted"}>
                        {gym.isActive ? "Active" : "Inactive"}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <form action={setGymActiveAction}>
                        <input type="hidden" name="id" value={gym.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={String(!gym.isActive)}
                        />
                        <Button type="submit" variant="ghost" size="sm">
                          {gym.isActive ? "Deactivate" : "Reactivate"}
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
    </div>
  );
}
