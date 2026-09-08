"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { Member } from "@/db/queries";
import { paiseToRupees } from "@/lib/money";
import type { ActionState } from "@/lib/result";

import { setMemberFeeAction, updateMemberAction } from "../actions";

function Saver({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function EditMemberForm({ member }: { member: Member }) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateMemberAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={member.id} />
      <FormField htmlFor="e-name" label="Name">
        <Input id="e-name" name="name" defaultValue={member.name} />
      </FormField>
      <FormField htmlFor="e-phone" label="Phone">
        <Input id="e-phone" name="phone" defaultValue={member.phone} />
      </FormField>
      <FormField htmlFor="e-email" label="Email">
        <Input id="e-email" name="email" type="email" defaultValue={member.email ?? ""} />
      </FormField>
      <FormField htmlFor="e-anchor" label="Billing day">
        <Input
          id="e-anchor"
          name="billingAnchorDay"
          type="number"
          min={1}
          max={28}
          defaultValue={member.billingAnchorDay}
        />
      </FormField>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Saver label="Save details" />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {state?.ok && <p className="text-sm text-success">Saved.</p>}
      </div>
    </form>
  );
}

export function MemberFeeForm({ member }: { member: Member }) {
  const [state, action] = useActionState<ActionState, FormData>(
    setMemberFeeAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={member.id} />
      <FormField
        htmlFor="fee"
        label="Monthly fee ₹"
        hint="Leave blank to use the gym default."
      >
        <Input
          id="fee"
          name="monthlyFeeRupees"
          type="number"
          min={0}
          step="1"
          defaultValue={
            member.monthlyFeePaise == null
              ? ""
              : paiseToRupees(member.monthlyFeePaise)
          }
        />
      </FormField>
      <Saver label="Save fee" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {state?.ok && <p className="text-sm text-success">Saved.</p>}
    </form>
  );
}
