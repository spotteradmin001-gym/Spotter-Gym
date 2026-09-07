"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/result";

import { forgotPasswordAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    forgotPasswordAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="rounded-md border border-success/40 bg-muted-background p-3">
          If an account exists for that email, a reset link is on its way. The
          link expires in 1 hour.
        </p>
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField htmlFor="forgot-email" label="Email">
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SubmitButton />
      <Link href="/login" className="text-center text-sm text-primary hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
