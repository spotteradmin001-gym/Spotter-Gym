"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ShareViaWhatsApp } from "@/components/share-via-whatsapp";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/result";

import { createOwnerAction, type CreateOwnerResult } from "../../actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Creating…" : "Create owner login"}
    </Button>
  );
}

export function CreateOwnerForm({ gymId }: { gymId: string }) {
  const [state, formAction] = useActionState<
    ActionState<CreateOwnerResult>,
    FormData
  >(createOwnerAction, null);

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-success/40 bg-muted-background p-3 text-sm">
        <p>
          Owner login created for <strong>{state.data.email}</strong>.
        </p>
        <p>
          One-time password (shown once — copy it now):{" "}
          <code className="rounded bg-card px-1 py-0.5 font-mono">
            {state.data.password}
          </code>
        </p>
        <p className="text-muted">
          They&apos;ll be asked to set their own password on first sign-in.
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
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="gymId" value={gymId} />
      <FormField htmlFor="owner-email" label="Owner email">
        <Input id="owner-email" name="email" type="email" required />
      </FormField>
      <FormField htmlFor="owner-phone" label="Phone (optional)">
        <Input id="owner-phone" name="phone" type="tel" />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
