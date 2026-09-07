"use server";

import { revalidatePath } from "next/cache";

import {
  AuthError,
  ExpenseError,
  MemberError,
  PaymentError,
  addExpense,
  createMember,
  createPermissionRequest,
  recordPayment,
  updateMember,
} from "@/db/queries";
import { rupeesToPaise } from "@/lib/money";
import { err, ok, type ActionState } from "@/lib/result";
import { requireEmployeePermission } from "@/src/features/auth/employee-scope";

type Outcome = { pending: boolean };

function toMessage(error: unknown): string {
  if (
    error instanceof AuthError ||
    error instanceof MemberError ||
    error instanceof PaymentError ||
    error instanceof ExpenseError
  ) {
    return error.message;
  }
  return "Something went wrong. Try again.";
}

function feePaise(form: FormData, key: string): number | null {
  const s = String(form.get(key) ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? rupeesToPaise(n) : null;
}

export async function createMemberOrRequest(
  _prev: ActionState<Outcome>,
  formData: FormData,
): Promise<ActionState<Outcome>> {
  let gate;
  try {
    gate = await requireEmployeePermission("member.create");
  } catch (error) {
    return err(toMessage(error));
  }
  const { ctx, requiresApproval } = gate;

  const payload = {
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    joinDate: String(formData.get("joinDate") ?? ""),
    monthlyFeePaise: feePaise(formData, "monthlyFeeRupees"),
    billingAnchorDay: Number(formData.get("billingAnchorDay") ?? 1),
  };

  try {
    if (requiresApproval) {
      await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "member.create",
        payload,
      });
      return ok({ pending: true });
    }
    await createMember({ gymId: ctx.gymId, ...payload, email: payload.email || undefined });
    revalidatePath("/employee/members");
    return ok({ pending: false });
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function updateMemberOrRequest(
  _prev: ActionState<Outcome>,
  formData: FormData,
): Promise<ActionState<Outcome>> {
  let gate;
  try {
    gate = await requireEmployeePermission("member.edit");
  } catch (error) {
    return err(toMessage(error));
  }
  const { ctx, requiresApproval } = gate;
  const memberId = String(formData.get("memberId") ?? "");
  const payload = {
    memberId,
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    billingAnchorDay: Number(formData.get("billingAnchorDay") ?? 1),
  };

  try {
    if (requiresApproval) {
      await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "member.edit",
        payload,
      });
      return ok({ pending: true });
    }
    await updateMember(ctx.gymId, memberId, {
      name: payload.name || undefined,
      phone: payload.phone || undefined,
      email: (payload.email.trim() || null) as string | null,
      billingAnchorDay: payload.billingAnchorDay,
    });
    revalidatePath(`/employee/members/${memberId}`);
    return ok({ pending: false });
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function recordPaymentOrRequest(
  _prev: ActionState<Outcome>,
  formData: FormData,
): Promise<ActionState<Outcome>> {
  let gate;
  try {
    gate = await requireEmployeePermission("payment.record");
  } catch (error) {
    return err(toMessage(error));
  }
  const { ctx, requiresApproval } = gate;

  const rupees = Number(String(formData.get("amountRupees") ?? ""));
  if (!Number.isFinite(rupees) || rupees <= 0) {
    return err("Enter an amount greater than zero.");
  }
  const payload = {
    memberId: String(formData.get("memberId") ?? ""),
    amountPaise: rupeesToPaise(rupees),
    paidOn: String(formData.get("paidOn") ?? ""),
    method: String(formData.get("method") ?? "cash"),
    note: String(formData.get("note") ?? ""),
  };

  try {
    if (requiresApproval) {
      await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "payment.record",
        payload,
      });
      return ok({ pending: true });
    }
    await recordPayment({ gymId: ctx.gymId, ...payload, recordedBy: ctx.user.id });
    revalidatePath("/employee/payments");
    return ok({ pending: false });
  } catch (error) {
    return err(toMessage(error));
  }
}

export async function addExpenseOrRequest(
  _prev: ActionState<Outcome>,
  formData: FormData,
): Promise<ActionState<Outcome>> {
  let gate;
  try {
    gate = await requireEmployeePermission("expense.create");
  } catch (error) {
    return err(toMessage(error));
  }
  const { ctx, requiresApproval } = gate;

  const rupees = Number(String(formData.get("amountRupees") ?? ""));
  if (!Number.isFinite(rupees) || rupees < 0) return err("Enter a valid amount.");
  const payload = {
    label: String(formData.get("label") ?? ""),
    amountPaise: rupeesToPaise(rupees),
    incurredOn: String(formData.get("incurredOn") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
  };

  try {
    if (requiresApproval) {
      await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "expense.create",
        payload,
      });
      return ok({ pending: true });
    }
    await addExpense({
      gymId: ctx.gymId,
      ...payload,
      categoryId: payload.categoryId || null,
      addedBy: ctx.user.id,
    });
    revalidatePath("/employee/expenses");
    return ok({ pending: false });
  } catch (error) {
    return err(toMessage(error));
  }
}
