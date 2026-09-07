"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Member } from "@/db/queries";
import type { ActionState } from "@/lib/result";

import {
  addExpenseOrRequest,
  createMemberOrRequest,
  recordPaymentOrRequest,
  updateMemberOrRequest,
} from "./actions";

type Outcome = { pending: boolean };
type Opt = { id: string; name: string };

function Btn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Result({ state }: { state: ActionState<Outcome> }) {
  if (state?.ok) {
    return (
      <p className="text-sm text-success">
        {state.data.pending ? "Sent to the owner for approval." : "Done."}
      </p>
    );
  }
  if (state && !state.ok) {
    return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  }
  return null;
}

export function AddMemberForm({ today }: { today: string }) {
  const [state, action] = useActionState<ActionState<Outcome>, FormData>(
    createMemberOrRequest,
    null,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <FormField htmlFor="m-name" label="Name">
        <Input id="m-name" name="name" required minLength={2} />
      </FormField>
      <FormField htmlFor="m-phone" label="Phone">
        <Input id="m-phone" name="phone" type="tel" required />
      </FormField>
      <FormField htmlFor="m-email" label="Email (optional)">
        <Input id="m-email" name="email" type="email" />
      </FormField>
      <FormField htmlFor="m-join" label="Join date">
        <Input id="m-join" name="joinDate" type="date" defaultValue={today} required />
      </FormField>
      <FormField htmlFor="m-fee" label="Monthly fee ₹ (blank = default)">
        <Input id="m-fee" name="monthlyFeeRupees" type="number" min={0} step="1" />
      </FormField>
      <FormField htmlFor="m-anchor" label="Billing day">
        <Input id="m-anchor" name="billingAnchorDay" type="number" min={1} max={28} defaultValue={1} />
      </FormField>
      <div className="sm:col-span-3 flex items-center gap-3">
        <Btn label="Add member" />
        <Result state={state} />
      </div>
    </form>
  );
}

export function EditMemberForm({ member }: { member: Member }) {
  const [state, action] = useActionState<ActionState<Outcome>, FormData>(
    updateMemberOrRequest,
    null,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="memberId" value={member.id} />
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
        <Input id="e-anchor" name="billingAnchorDay" type="number" min={1} max={28} defaultValue={member.billingAnchorDay} />
      </FormField>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Btn label="Save" />
        <Result state={state} />
      </div>
    </form>
  );
}

export function RecordPaymentForm({
  today,
  members,
}: {
  today: string;
  members: Opt[];
}) {
  const [state, action] = useActionState<ActionState<Outcome>, FormData>(
    recordPaymentOrRequest,
    null,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <FormField htmlFor="p-member" label="Member">
        <Select id="p-member" name="memberId" required defaultValue="">
          <option value="" disabled>Choose…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </FormField>
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
      <FormField htmlFor="p-note" label="Note" className="sm:col-span-2">
        <Input id="p-note" name="note" />
      </FormField>
      <div className="sm:col-span-3 flex items-center gap-3">
        <Btn label="Record payment" />
        <Result state={state} />
      </div>
    </form>
  );
}

export function AddExpenseForm({
  today,
  categories,
}: {
  today: string;
  categories: Opt[];
}) {
  const [state, action] = useActionState<ActionState<Outcome>, FormData>(
    addExpenseOrRequest,
    null,
  );
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4">
      <FormField htmlFor="x-label" label="Label">
        <Input id="x-label" name="label" required minLength={2} />
      </FormField>
      <FormField htmlFor="x-amount" label="Amount ₹">
        <Input id="x-amount" name="amountRupees" type="number" min={0} step="1" required />
      </FormField>
      <FormField htmlFor="x-date" label="Incurred on">
        <Input id="x-date" name="incurredOn" type="date" defaultValue={today} required />
      </FormField>
      <FormField htmlFor="x-cat" label="Category">
        <Select id="x-cat" name="categoryId" defaultValue="">
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </FormField>
      <div className="sm:col-span-4 flex items-center gap-3">
        <Btn label="Add expense" />
        <Result state={state} />
      </div>
    </form>
  );
}
