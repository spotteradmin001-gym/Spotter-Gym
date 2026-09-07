import Link from "next/link";

import { requireOwner } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/owner", label: "Overview" },
  { href: "/owner/members", label: "Members" },
  { href: "/owner/payments", label: "Payments" },
  { href: "/owner/expenses", label: "Expenses" },
  { href: "/owner/pnl", label: "P&L" },
  { href: "/owner/employees", label: "Employees" },
  { href: "/owner/approvals", label: "Approvals" },
  { href: "/owner/settings", label: "Settings" },
];

export default async function OwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOwner();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <nav className="flex gap-4 border-b border-border pb-2 text-sm">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="font-medium hover:text-primary">
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
