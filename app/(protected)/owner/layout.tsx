import { PortalNav, type NavItem } from "@/components/portal-nav";
import { requireOwner } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/owner", label: "Overview" },
  { href: "/owner/members", label: "Members" },
  { href: "/owner/payments", label: "Payments" },
  { href: "/owner/expenses", label: "Expenses" },
  { href: "/owner/pnl", label: "P&L" },
  { href: "/owner/reminders", label: "Reminders" },
  { href: "/owner/promotions", label: "Promotions" },
  { href: "/owner/checkin-qr", label: "QR code" },
  { href: "/owner/employees", label: "Employees" },
  { href: "/owner/approvals", label: "Approvals" },
  { href: "/owner/staff-activity", label: "Staff activity" },
  { href: "/owner/settings", label: "Settings" },
];

export default async function OwnerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOwner();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <PortalNav items={NAV} />
      {children}
    </div>
  );
}
