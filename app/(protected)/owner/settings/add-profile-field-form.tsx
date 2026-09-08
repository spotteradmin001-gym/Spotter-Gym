"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionState } from "@/lib/result";

import { addProfileFieldAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Adding…" : "Add field"}
    </Button>
  );
}

export function AddProfileFieldForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    addProfileFieldAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <FormField htmlFor="pf-label" label="Label">
        <Input id="pf-label" name="label" required minLength={2} />
      </FormField>
      <FormField htmlFor="pf-key" label="Key" hint="lowercase, e.g. blood_group">
        <Input id="pf-key" name="key" required pattern="[a-z][a-z0-9_]{1,39}" />
      </FormField>
      <FormField htmlFor="pf-type" label="Type">
        <Select id="pf-type" name="fieldType" defaultValue="text">
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
        </Select>
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" /> Required
      </label>
      <div className="sm:col-span-4 flex items-center gap-3">
        <SubmitButton />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {state?.ok && <p className="text-sm text-success">Added.</p>}
      </div>
    </form>
  );
}
