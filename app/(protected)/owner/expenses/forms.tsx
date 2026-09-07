"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ActionState } from "@/lib/result";

import {
  addCategoryAction,
  addExpenseAction,
  addRecurringAction,
} from "./actions";

type Option = { id: string; name: string };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Feedback({ state }: { state: ActionState }) {
  if (state?.ok) return <p className="text-sm text-success">Saved.</p>;
  if (state && !state.ok)
    return <p role="alert" className="text-sm text-destructive">{state.error}</p>;
  return null;
}

export function AddCategoryForm() {
  const [state, action] = useActionState<ActionState, FormData>(addCategoryAction, null);
  return (
    <form action={action} className="flex items-end gap-2">
      <FormField htmlFor="cat-name" label="New category">
        <Input id="cat-name" name="name" required minLength={2} />
      </FormField>
      <Submit label="Add" />
      <Feedback state={state} />
    </form>
  );
}

export function AddRecurringForm({
  categories,
  employees,
}: {
  categories: Option[];
  employees: Option[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(addRecurringAction, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <FormField htmlFor="r-label" label="Label">
        <Input id="r-label" name="label" required minLength={2} />
      </FormField>
      <FormField htmlFor="r-amount" label="Amount ₹ / month">
        <Input id="r-amount" name="amountRupees" type="number" min={0} step="1" required />
      </FormField>
      <FormField htmlFor="r-day" label="Day of month (1–28)">
        <Input id="r-day" name="dayOfMonth" type="number" min={1} max={28} defaultValue={1} />
      </FormField>
      <FormField htmlFor="r-cat" label="Category">
        <Select id="r-cat" name="categoryId" defaultValue="">
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </FormField>
      <FormField htmlFor="r-emp" label="Linked employee (salary)">
        <Select id="r-emp" name="linkedEmployeeId" defaultValue="">
          <option value="">—</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </Select>
      </FormField>
      <div className="sm:col-span-3 flex items-center gap-3">
        <Submit label="Add recurring" />
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function AddExpenseForm({
  categories,
  today,
}: {
  categories: Option[];
  today: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(addExpenseAction, null);
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
        <Submit label="Add expense" />
        <Feedback state={state} />
      </div>
    </form>
  );
}
