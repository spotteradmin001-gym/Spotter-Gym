"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/result";
import { MIN_PASSWORD_LENGTH } from "@/src/features/auth/password";

import { activateAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
      {pending ? "Setting up…" : "Create my login"}
    </Button>
  );
}

export function ActivateForm({
  token,
  defaultEmail,
}: {
  token: string;
  defaultEmail: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    activateAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <FormField htmlFor="a-email" label="Email">
        <Input
          id="a-email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={defaultEmail}
          required
        />
      </FormField>
      <FormField htmlFor="a-pw" label="Choose a password">
        <Input
          id="a-pw"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </FormField>
      <FormField
        htmlFor="a-confirm"
        label="Confirm password"
        error={fieldErrors?.confirmPassword}
      >
        <Input
          id="a-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
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
