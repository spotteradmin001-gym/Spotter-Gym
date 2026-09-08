import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listPermissionRequests } from "@/db/queries";
import { requireOwner } from "@/src/features/auth/guards";

import { decideRequestAction } from "./actions";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  "member.create": "Add member",
  "member.edit": "Edit member",
  "payment.record": "Record payment",
  "expense.create": "Add expense",
  "expense.edit": "Edit expense",
};

export default async function OwnerApprovalsPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const pending = await listPermissionRequests(user.gymId, "pending");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending approvals ({pending.length})</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting.</p>
        ) : (
          pending.map((req) => (
            <div
              key={req.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {ACTION_LABEL[req.actionType] ?? req.actionType}
                </p>
                <p className="text-xs text-muted">
                  {req.employeeName} ·{" "}
                  {new Date(req.createdAt).toLocaleString()}
                </p>
                <pre className="mt-1 max-w-full overflow-x-auto rounded bg-muted-background p-2 text-xs sm:max-w-lg">
                  {JSON.stringify(req.payload, null, 2)}
                </pre>
              </div>
              <div className="flex gap-2">
                <form action={decideRequestAction}>
                  <input type="hidden" name="id" value={req.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <Button type="submit" size="sm">
                    Approve
                  </Button>
                </form>
                <form action={decideRequestAction}>
                  <input type="hidden" name="id" value={req.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <Button type="submit" variant="secondary" size="sm">
                    Reject
                  </Button>
                </form>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
