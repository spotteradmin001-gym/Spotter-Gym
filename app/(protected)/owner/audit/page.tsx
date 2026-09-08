import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listAudits } from "@/db/queries";
import { requireOwner } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function OwnerAuditPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const entries = await listAudits({ gymId: user.gymId, limit: 300 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity log</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nothing logged yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>By</TH>
                <TH>Action</TH>
                <TH>Details</TH>
              </TR>
            </THead>
            <TBody>
              {entries.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString()}
                  </TD>
                  <TD>{e.actorEmail ?? "—"}</TD>
                  <TD className="font-mono text-xs">{e.action}</TD>
                  <TD className="font-mono text-xs text-muted">
                    {e.meta ? JSON.stringify(e.meta) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
