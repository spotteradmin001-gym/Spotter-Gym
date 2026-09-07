"use server";

import { revalidatePath } from "next/cache";

import {
  ExpenseError,
  addCategory,
  addExpense,
  addRecurringExpense,
  deleteExpense,
  deleteRecurringExpense,
  materializeRecurringForGym,
  setRecurringActive,
} from "@/db/queries";
import { rupeesToPaise } from "@/lib/money";
import { err, ok, type ActionState } from "@/lib/result";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";

function toMessage(error: unknown): string {
  if (error instanceof ExpenseError) return error.message;
  return "Something went wrong. Try again.";
}

const paiseFrom = (form: FormData, key: string): number => {
  const n = Number(String(form.get(key) ?? ""));
  return Number.isFinite(n) && n >= 0 ? rupeesToPaise(n) : -1;
};

export async function addCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();
  try {
    await addCategory(gymId, String(formData.get("name") ?? ""));
    revalidatePath("/owner/expenses");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function addRecurringAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { gymId } = await requireOwnerGym();
  const amount = paiseFrom(formData, "amountRupees");
  if (amount < 0) return err("Enter a valid amount.");
  try {
    await addRecurringExpense({
      gymId,
      label: String(formData.get("label") ?? ""),
      amountPaise: amount,
      dayOfMonth: Number(formData.get("dayOfMonth") ?? 1),
      categoryId: String(formData.get("categoryId") ?? "") || null,
      linkedEmployeeId: String(formData.get("linkedEmployeeId") ?? "") || null,
    });
    revalidatePath("/owner/expenses");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function setRecurringActiveAction(formData: FormData): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await setRecurringActive(
    gymId,
    String(formData.get("id") ?? ""),
    String(formData.get("isActive") ?? "") === "true",
  );
  revalidatePath("/owner/expenses");
}

export async function deleteRecurringAction(formData: FormData): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await deleteRecurringExpense(gymId, String(formData.get("id") ?? ""));
  revalidatePath("/owner/expenses");
}

export async function addExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, gymId } = await requireOwnerGym();
  const amount = paiseFrom(formData, "amountRupees");
  if (amount < 0) return err("Enter a valid amount.");
  try {
    await addExpense({
      gymId,
      label: String(formData.get("label") ?? ""),
      amountPaise: amount,
      incurredOn: String(formData.get("incurredOn") ?? ""),
      categoryId: String(formData.get("categoryId") ?? "") || null,
      addedBy: user.id,
    });
    revalidatePath("/owner/expenses");
    return ok();
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await deleteExpense(gymId, String(formData.get("id") ?? ""));
  revalidatePath("/owner/expenses");
}

export async function materializeExpensesAction(): Promise<void> {
  const { gymId } = await requireOwnerGym();
  await materializeRecurringForGym(gymId);
  revalidatePath("/owner/expenses");
}
