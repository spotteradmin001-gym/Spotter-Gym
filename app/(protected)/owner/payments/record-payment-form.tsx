"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionState } from "@/lib/result";

import { recordPaymentAction } from "./actions";

type MemberOption = { id: string; name: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Recording…" : "Record payment"}
    </Button>
  );
}

export function RecordPaymentForm({
  today,
  members,
  fixedMember,
}: {
  today: string;
  members?: MemberOption[];
  fixedMember?: MemberOption;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    recordPaymentAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      {fixedMember ? (
        <input type="hidden" name="memberId" value={fixedMember.id} />
      ) : (
        <FormField htmlFor="p-member" label="Member">
          <Select id="p-member" name="memberId" required defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {(members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </FormField>
      )}
      <FormField htmlFor="p-amount" label="Amount ₹">
        <Input id="p-amount" name="amountRupees" type="number" min={1} step="1" required />
      </FormField>
      <FormField htmlFor="p-date" label="Paid on">
        <Input id="p-date" name="paidOn" type="date" defaultValue={today} required />
      </FormField>
      <FormField htmlFor="p-method" label="Method">
        <Select id="p-method" name="method" defaultValue="cash">
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="card">Card</option>
          <option value="bank">Bank transfer</option>
          <option value="other">Other</option>
        </Select>
      </FormField>
      <FormField htmlFor="p-note" label="Note (optional)" className="sm:col-span-2">
        <Input id="p-note" name="note" />
      </FormField>
      <div className="sm:col-span-3 flex items-center gap-3">
        <SubmitButton />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {state?.ok && <p className="text-sm text-success">Recorded.</p>}
      </div>
    </form>
  );
}
