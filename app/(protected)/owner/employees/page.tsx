import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listEmployees } from "@/db/queries";
import { requireOwner } from "@/src/features/auth/guards";

import { setEmployeeActiveAction } from "./actions";
import { AddEmployeeForm } from "./add-employee-form";
import { PermissionsForm } from "./permissions-form";

export const dynamic = "force-dynamic";

export default async function OwnerEmployeesPage() {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const employees = await listEmployees(user.gymId);

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
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{emp.name}</CardTitle>
                <p className="text-xs text-muted">
                  {emp.email}
                  {!emp.isActive && " · inactive"}
                </p>
              </div>
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
            </CardHeader>
            <CardContent>
              <PermissionsForm employee={emp} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
