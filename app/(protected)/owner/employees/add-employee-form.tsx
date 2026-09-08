"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ShareViaWhatsApp } from "@/components/share-via-whatsapp";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/result";

import { createEmployeeAction, type CreateEmployeeResult } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Creating…" : "Add employee"}
    </Button>
  );
}

export function AddEmployeeForm() {
  const [state, formAction] = useActionState<
    ActionState<CreateEmployeeResult>,
    FormData
  >(createEmployeeAction, null);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-success/40 bg-muted-background p-3 text-sm">
        <p>
          Login created for <strong>{state.data.email}</strong>. One-time
          password (shown once):{" "}
          <code className="rounded bg-card px-1 py-0.5 font-mono">
            {state.data.password}
          </code>
        </p>
        {state.data.phone ? (
          <ShareViaWhatsApp
            phone={state.data.phone}
            message={state.data.shareMessage}
            className="self-start"
          />
        ) : (
          <p className="text-xs text-muted">
            Add a phone number to share these details via WhatsApp.
          </p>
        )}
      </div>
    );
  }

  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      <FormField htmlFor="emp-name" label="Name">
        <Input id="emp-name" name="name" required minLength={2} />
      </FormField>
      <FormField htmlFor="emp-email" label="Email">
        <Input id="emp-email" name="email" type="email" required />
      </FormField>
      <FormField htmlFor="emp-phone" label="Phone (optional)">
        <Input id="emp-phone" name="phone" type="tel" />
      </FormField>
      <div className="sm:col-span-3 flex items-center gap-3">
        <SubmitButton />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
