import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/table";
import {
  expensesSummary,
  listCategories,
  listEmployees,
  listExpenses,
  listRecurringExpenses,
} from "@/db/queries";
import type { RangeKind } from "@/lib/billing";
import { formatPaise } from "@/lib/money";
import { requireOwner } from "@/src/features/auth/guards";

import {
  deleteExpenseAction,
  deleteRecurringAction,
  materializeExpensesAction,
  setRecurringActiveAction,
} from "./actions";
import { AddCategoryForm, AddExpenseForm, AddRecurringForm } from "./forms";

export const dynamic = "force-dynamic";

const PERIODS: { key: RangeKind; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "Last 12 months" },
];

export default async function OwnerExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireOwner();
  if (!user.gymId) notFound();
  const { period } = await searchParams;
  const range: RangeKind =
    period === "quarter" || period === "year" ? period : "month";

  const [categories, employees, recurring, list, summary] = await Promise.all([
    listCategories(user.gymId),
    listEmployees(user.gymId),
    listRecurringExpenses(user.gymId),
    listExpenses(user.gymId, { period: range }),
    expensesSummary(user.gymId, { period: range }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            {categories.map((c) => c.name).join(" · ") || "None yet."}
          </p>
          <AddCategoryForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Recurring</CardTitle>
          <form action={materializeExpensesAction}>
            <Button type="submit" variant="ghost" size="sm">
              Materialise this month
            </Button>
          </form>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-4">
          {recurring.length > 0 && (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Label</TH>
                  <TH>Amount</TH>
                  <TH>Day</TH>
                  <TH>Category</TH>
                  <TH>Employee</TH>
                  <TH>Active</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {recurring.map((r) => (
                  <TR key={r.id}>
                    <TD label="Label">{r.label}</TD>
                    <TD label="Amount">{formatPaise(r.amountPaise)}</TD>
                    <TD label="Day">{r.dayOfMonth}</TD>
                    <TD label="Category">{r.categoryName ?? "—"}</TD>
                    <TD label="Employee">{r.linkedEmployeeName ?? "—"}</TD>
                    <TD label="Active">
                      <form action={setRecurringActiveAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="isActive" value={String(!r.isActive)} />
                        <Button type="submit" variant="ghost" size="sm">
                          {r.isActive ? "Yes" : "No"}
                        </Button>
                      </form>
                    </TD>
                    <TD className="text-right">
                      <form action={deleteRecurringAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <Button type="submit" variant="ghost" size="sm">Remove</Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          <AddRecurringForm
            categories={categories}
            employees={employees.map((e) => ({ id: e.id, name: e.name }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Expenses — {formatPaise(summary.totalPaise)}</CardTitle>
          <div className="flex gap-3 text-sm">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/owner/expenses?period=${p.key}`}
                className={p.key === range ? "font-semibold" : "text-muted hover:text-primary"}
              >
                {p.label}
              </Link>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-4">
          <AddExpenseForm categories={categories} today={today} />
          {list.length === 0 ? (
            <p className="text-sm text-muted">No expenses in this period.</p>
          ) : (
            <Table variant="stacked">
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Label</TH>
                  <TH>Category</TH>
                  <TH>Amount</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {list.map((x) => (
                  <TR key={x.id}>
                    <TD label="Date">{x.incurredOn}</TD>
                    <TD label="Label">
                      {x.label}
                      {x.recurring && (
                        <span className="ml-1 text-xs text-muted">(recurring)</span>
                      )}
                    </TD>
                    <TD label="Category">{x.categoryName ?? "—"}</TD>
                    <TD label="Amount">{formatPaise(x.amountPaise)}</TD>
                    <TD className="text-right">
                      {!x.recurring && (
                        <form action={deleteExpenseAction}>
                          <input type="hidden" name="id" value={x.id} />
                          <Button type="submit" variant="ghost" size="sm">Remove</Button>
                        </form>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
