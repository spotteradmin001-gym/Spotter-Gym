import { notFound } from "next/navigation";

import { CredentialControls } from "@/components/credential-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WaContactLink } from "@/components/wa-contact-link";
import { listEmployees } from "@/db/queries";
import { isCredentialVaultEnabled } from "@/lib/credential-crypto";
import { requireOwner } from "@/src/features/auth/guards";

import {
  resetEmployeePasswordAction,
  revealEmployeePasswordAction,
  setEmployeeActiveAction,
} from "./actions";
import { AddEmployeeForm } from "./add-employee-form";
import { PermissionsForm } from "./permissions-form";

export const dynamic = "force-dynamic";

export default async function OwnerEmployeesPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const employees = await listEmployees(user.gymId);
  const vaultEnabled = isCredentialVaultEnabled();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Add an employee</CardTitle>
        </CardHeader>
        <CardContent>
          <AddEmployeeForm />
        </CardContent>
      </Card>

      {employees.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted">
            No employees yet.
          </CardContent>
        </Card>
      ) : (
        employees.map((emp) => (
          <Card key={emp.id}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{emp.name}</CardTitle>
                <p className="text-xs text-muted">
                  {emp.email}
                  {!emp.isActive && " · inactive"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <WaContactLink
                  phone={emp.phone}
                  label={`Message ${emp.name} on WhatsApp`}
                />
                <form action={setEmployeeActiveAction}>
                  <input type="hidden" name="employeeId" value={emp.id} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={String(!emp.isActive)}
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    {emp.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </form>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PermissionsForm employee={emp} />
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted">
                  Login credentials
                </p>
                <CredentialControls
                  targetUserId={emp.userId}
                  targetRole="employee"
                  phone={emp.phone}
                  vaultEnabled={vaultEnabled}
                  revealAction={revealEmployeePasswordAction}
                  resetAction={resetEmployeePasswordAction}
                />
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
