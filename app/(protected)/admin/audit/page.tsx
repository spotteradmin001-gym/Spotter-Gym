import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import { listAudits } from "@/db/queries";
import { requireAdmin } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireAdmin();
  const entries = await listAudits({ limit: 300 });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table variant="stacked">
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Target</TH>
            </TR>
          </THead>
          <TBody>
            {entries.map((e) => (
              <TR key={e.id}>
                <TD label="When" className="whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString()}
                </TD>
                <TD label="Actor">
                  {e.actorEmail ?? "—"}
                  {e.actorRole && (
                    <span className="ml-1 text-xs text-muted">{e.actorRole}</span>
                  )}
                </TD>
                <TD label="Action" className="font-mono text-xs">{e.action}</TD>
                <TD label="Target" className="font-mono text-xs text-muted">
                  {e.targetType}
                  {e.targetId ? `:${e.targetId.slice(0, 8)}` : ""}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
