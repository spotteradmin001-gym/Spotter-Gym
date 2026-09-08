import { PortalNav, type NavItem } from "@/components/portal-nav";
import { listPermissionsForUser } from "@/db/queries";
import { requireEmployee } from "@/src/features/auth/guards";
import { PERMISSION_LABELS, type Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Nav items that light up when the employee holds the matching permission. */
const NAV: { href: string; label: string; needs: Permission[] }[] = [
  { href: "/employee/members", label: "Members", needs: ["member.create", "member.edit"] },
  { href: "/employee/payments", label: "Payments", needs: ["payment.record"] },
  { href: "/employee/expenses", label: "Expenses", needs: ["expense.create", "expense.edit"] },
];

export default async function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireEmployee();
  const perms = await listPermissionsForUser(user.id);
  const held = new Set(perms.map((p) => p.permission));

  const items: NavItem[] = [
    { href: "/employee", label: "Home" },
    ...NAV.filter((n) => n.needs.some((p) => held.has(p))).map(({ href, label }) => ({
      href,
      label,
    })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <PortalNav items={items} />
      {perms.length === 0 && (
        <p className="text-sm text-muted">
          No permissions yet — ask the gym owner to grant some.
        </p>
      )}
      {children}
      {perms.length > 0 && (
        <p className="text-xs text-muted">
          You can:{" "}
          {perms
            .map(
              (p) =>
                PERMISSION_LABELS[p.permission] +
                (p.requiresApproval ? " (needs approval)" : ""),
            )
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
