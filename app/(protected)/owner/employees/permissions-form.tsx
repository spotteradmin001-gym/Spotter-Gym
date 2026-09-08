"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { Employee } from "@/db/queries";
import { EMPLOYEE_PERMISSIONS, PERMISSION_LABELS } from "@/lib/permissions";
import type { ActionState } from "@/lib/result";

import { setPermissionsAction } from "./actions";

const LABELS = PERMISSION_LABELS;

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save permissions"}
    </Button>
  );
}

export function PermissionsForm({ employee }: { employee: Employee }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setPermissionsAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;
  const current = new Map(
    employee.permissions.map((p) => [p.permission, p.requiresApproval]),
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="employeeId" value={employee.id} />
      <div className="grid gap-1">
        {EMPLOYEE_PERMISSIONS.map((perm) => (
          <div key={perm} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <label className="flex min-w-40 items-center gap-2">
              <input
                type="checkbox"
                name={`perm:${perm}`}
                defaultChecked={current.has(perm)}
              />
              {LABELS[perm]}
            </label>
            <label className="flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                name={`approval:${perm}`}
                defaultChecked={current.get(perm) === true}
              />
              needs approval
            </label>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <SaveButton />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {state?.ok && <p className="text-sm text-success">Saved.</p>}
      </div>
    </form>
  );
}
