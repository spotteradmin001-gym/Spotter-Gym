"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/result";

import { updateGymWahaSessionAction } from "../../actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

export function WahaSessionForm({
  gymId,
  wahaSessionName,
  slug,
}: {
  gymId: string;
  wahaSessionName: string | null;
  slug: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateGymWahaSessionAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="gymId" value={gymId} />
      <FormField
        htmlFor="waha-session"
        label="WAHA session name"
        hint={`The WhatsApp session this gym's reminders send from. Blank falls back to the slug ("${slug}").`}
        className="flex-1"
      >
        <Input
          id="waha-session"
          name="wahaSessionName"
          defaultValue={wahaSessionName ?? ""}
          placeholder={slug}
        />
      </FormField>
      <SaveButton />
      {error && (
        <p role="alert" className="text-sm text-destructive sm:w-full">
          {error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-success sm:w-full">Saved.</p>}
    </form>
  );
}
