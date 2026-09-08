"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/result";

import { createGymAction } from "../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Adding…" : "Add gym"}
    </Button>
  );
}

export function CreateGymForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createGymAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;
  const done = state?.ok === true;

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <FormField htmlFor="gym-name" label="Name" className="flex-1">
        <Input id="gym-name" name="name" required minLength={2} />
      </FormField>
      <FormField htmlFor="gym-tz" label="Timezone" className="flex-1">
        <Input id="gym-tz" name="timezone" placeholder="Asia/Kolkata" />
      </FormField>
      <FormField
        htmlFor="gym-waha"
        label="WAHA session name"
        hint="The WhatsApp session this gym sends from. Leave blank to use the gym slug."
        className="flex-1"
      >
        <Input id="gym-waha" name="wahaSessionName" placeholder="Defaults to the slug" />
      </FormField>
      <SubmitButton />
      {error && (
        <p role="alert" className="text-sm text-destructive sm:w-full">
          {error}
        </p>
      )}
      {done && (
        <p className="text-sm text-success sm:w-full">Gym added.</p>
      )}
    </form>
  );
}
