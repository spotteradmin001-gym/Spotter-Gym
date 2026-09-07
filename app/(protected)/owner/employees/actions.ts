"use server";

import { revalidatePath } from "next/cache";

import {
  EMPLOYEE_PERMISSIONS,
  EmployeeError,
  createEmployee,
  setEmployeeActive,
  setPermissions,
  type EmployeePermission,
  type Permission,
} from "@/db/queries";
import { err, ok, type ActionState } from "@/lib/result";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";

function toMessage(error: unknown): string {
  if (error instanceof EmployeeError) return error.message;
  return "Something went wrong. Try again.";
}

export type CreateEmployeeResult = { email: string; password: string };

export async function createEmployeeAction(
  _prev: ActionState<CreateEmployeeResult>,
  formData: FormData,
): Promise<ActionState<CreateEmployeeResult>> {
  const { gymId } = await requireOwnerGym();
  try {
    const { employee, password } = await createEmployee({
      gymId,
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? "") || undefined,
      email: String(formData.get("email") ?? ""),
    });
    revalidatePath("/owner/employees");
    return ok({ email: employee.email, password });
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function setPermissionsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, gymId } = await requireOwnerGym();
  const employeeId = String(formData.get("employeeId") ?? "");

  const permissions: EmployeePermission[] = [];
  for (const permission of EMPLOYEE_PERMISSIONS) {
    if (formData.get(`perm:${permission}`) === "on") {
      permissions.push({
        permission: permission as Permission,
        requiresApproval: formData.get(`approval:${permission}`) === "on",
      });
    }
  }

  try {
    await setPermissions({ gymId, employeeId, grantedBy: user.id, permissions });
    revalidatePath("/owner/employees");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function setEmployeeActiveAction(formData: FormData): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await setEmployeeActive({
    gymId,
    employeeId: String(formData.get("employeeId") ?? ""),
    isActive: String(formData.get("isActive") ?? "") === "true",
  });
  revalidatePath("/owner/employees");
}
