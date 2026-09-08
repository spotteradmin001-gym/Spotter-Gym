import { notFound, redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  listCategories,
  listExpenses,
  listPermissionsForUser,
} from "@/db/queries";
import { formatPaise } from "@/lib/money";
import { requireEmployee } from "@/src/features/auth/guards";

import { AddExpenseForm } from "../forms";

export const dynamic = "force-dynamic";

export default async function EmployeeExpensesPage() {
  const user = await requireEmployee();
  if (!user.gymId) notFound();

  const perms = await listPermissionsForUser(user.id);
  const canAdd = perms.some((p) => p.permission === "expense.create");
  if (!canAdd && !perms.some((p) => p.permission === "expense.edit")) {
    redirect("/employee");
  }

  const [categories, expenses] = await Promise.all([
    listCategories(user.gymId),
    listExpenses(user.gymId, { period: "month" }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      {canAdd && (
        <Card>
          <CardHeader>
            <CardTitle>Add an expense</CardTitle>
          </CardHeader>
          <CardContent>
            <AddExpenseForm today={today} categories={categories} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>This month ({expenses.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table variant="stacked">
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Label</TH>
                <TH>Category</TH>
                <TH>Amount</TH>
              </TR>
            </THead>
            <TBody>
              {expenses.map((x) => (
                <TR key={x.id}>
                  <TD label="Date">{x.incurredOn}</TD>
                  <TD label="Label">{x.label}</TD>
                  <TD label="Category">{x.categoryName ?? "—"}</TD>
                  <TD label="Amount">{formatPaise(x.amountPaise)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
