"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ProfileField } from "@/db/queries";
import type { ActionState } from "@/lib/result";

import { saveProfileAction } from "./actions";

const TYPE_TO_INPUT: Record<string, string> = {
  text: "text",
  number: "number",
  date: "date",
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
      {pending ? "Saving…" : "Save profile"}
    </Button>
  );
}

export function ProfileForm({
  fields,
  values,
}: {
  fields: ProfileField[];
  values: Record<string, string>;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveProfileAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {fields.map((field) => (
        <FormField
          key={field.id}
          htmlFor={`f-${field.key}`}
          label={field.label}
          required={field.required}
        >
          <Input
            id={`f-${field.key}`}
            name={`f:${field.key}`}
            type={TYPE_TO_INPUT[field.fieldType] ?? "text"}
            defaultValue={values[field.key] ?? ""}
            required={field.required}
          />
        </FormField>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-success">Saved.</p>}
      <SaveButton />
    </form>
  );
}
