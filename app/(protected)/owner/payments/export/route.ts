import { listPayments } from "@/db/queries";
import type { RangeKind } from "@/lib/billing";
import { paiseToRupees } from "@/lib/money";
import { requireOwnerGym } from "@/src/features/auth/owner-scope";

export const dynamic = "force-dynamic";

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(request: Request) {
  const { gymId } = await requireOwnerGym();

  const period = new URL(request.url).searchParams.get("period");
  const range: RangeKind =
    period === "quarter" || period === "year" ? period : "month";

  const rows = await listPayments(gymId, { period: range });

  const header = ["paid_on", "member", "amount_inr", "method", "note"];
  const body = rows.map((p) =>
    [
      p.paidOn,
      p.memberName,
      String(paiseToRupees(p.amountPaise)),
      p.method,
      p.note ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = [header.join(","), ...body].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payments-${range}.csv"`,
    },
  });
}
