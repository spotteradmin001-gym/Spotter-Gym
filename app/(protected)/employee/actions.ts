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
  writeAudit,
} from "@/db/queries";
import { rupeesToPaise } from "@/lib/money";
import { err, ok, type ActionState } from "@/lib/result";
import {
  requireEmployeePermission,
  type EmployeeContext,
} from "@/src/features/auth/employee-scope";

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

/**
 * Records that an employee filed an approval request. Feeds the owner's
 * staff-activity view; `meta.actionType` says what write is waiting.
 */
async function auditRequestFiled(
  ctx: EmployeeContext,
  requestId: string,
  actionType: string,
): Promise<void> {
  await writeAudit({
    actorUserId: ctx.user.id,
    actorRole: "employee",
    gymId: ctx.gymId,
    action: "permission_request.filed",
    targetType: "permission_request",
    targetId: requestId,
    meta: { actionType },
  });
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
      const requestId = await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "member.create",
        payload,
      });
      await auditRequestFiled(ctx, requestId, "member.create");
      return ok({ pending: true });
    }
    const member = await createMember({
      gymId: ctx.gymId,
      ...payload,
      email: payload.email || undefined,
    });
    await writeAudit({
      actorUserId: ctx.user.id,
      actorRole: "employee",
      gymId: ctx.gymId,
      action: "member.create",
      targetType: "member",
      targetId: member.id,
    });
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
      const requestId = await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "member.edit",
        payload,
      });
      await auditRequestFiled(ctx, requestId, "member.edit");
      return ok({ pending: true });
    }
    await updateMember(ctx.gymId, memberId, {
      name: payload.name || undefined,
      phone: payload.phone || undefined,
      email: (payload.email.trim() || null) as string | null,
      billingAnchorDay: payload.billingAnchorDay,
    });
    await writeAudit({
      actorUserId: ctx.user.id,
      actorRole: "employee",
      gymId: ctx.gymId,
      action: "member.edit",
      targetType: "member",
      targetId: memberId,
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
      const requestId = await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "payment.record",
        payload,
      });
      await auditRequestFiled(ctx, requestId, "payment.record");
      return ok({ pending: true });
    }
    await recordPayment({ gymId: ctx.gymId, ...payload, recordedBy: ctx.user.id });
    await writeAudit({
      actorUserId: ctx.user.id,
      actorRole: "employee",
      gymId: ctx.gymId,
      action: "payment.record",
      targetType: "member",
      targetId: payload.memberId,
      meta: {
        amountPaise: payload.amountPaise,
        method: payload.method,
        paidOn: payload.paidOn,
      },
    });
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
      const requestId = await createPermissionRequest({
        gymId: ctx.gymId,
        employeeId: ctx.employeeId,
        actionType: "expense.create",
        payload,
      });
      await auditRequestFiled(ctx, requestId, "expense.create");
      return ok({ pending: true });
    }
    await addExpense({
      gymId: ctx.gymId,
      ...payload,
      categoryId: payload.categoryId || null,
      addedBy: ctx.user.id,
    });
    await writeAudit({
      actorUserId: ctx.user.id,
      actorRole: "employee",
      gymId: ctx.gymId,
      action: "expense.create",
      targetType: "expense",
      targetId: null,
      meta: { amountPaise: payload.amountPaise, label: payload.label },
    });
    revalidatePath("/employee/expenses");
    return ok({ pending: false });
  } catch (error) {
    return err(toMessage(error));
  }
}
