"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/result";

import { createMemberAction } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Adding…" : "Add member"}
    </Button>
  );
}

export function AddMemberForm({ today }: { today: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createMemberAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      <FormField htmlFor="m-name" label="Name">
        <Input id="m-name" name="name" required minLength={2} />
      </FormField>
      <FormField htmlFor="m-phone" label="Phone" hint="Local or +country">
        <Input id="m-phone" name="phone" type="tel" required />
      </FormField>
      <FormField htmlFor="m-email" label="Email (optional)">
        <Input id="m-email" name="email" type="email" />
      </FormField>
      <FormField htmlFor="m-join" label="Join date">
        <Input id="m-join" name="joinDate" type="date" defaultValue={today} required />
      </FormField>
      <FormField htmlFor="m-fee" label="Monthly fee ₹ (blank = gym default)">
        <Input id="m-fee" name="monthlyFeeRupees" type="number" min={0} step="1" />
      </FormField>
      <FormField htmlFor="m-anchor" label="Billing day (1–28)">
        <Input id="m-anchor" name="billingAnchorDay" type="number" min={1} max={28} defaultValue={1} />
      </FormField>
      <div className="sm:col-span-3 flex items-center gap-3">
        <SubmitButton />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </form>
  );
}
