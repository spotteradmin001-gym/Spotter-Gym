import { PortalNav, type NavItem } from "@/components/portal-nav";
import { requireAdmin } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/admin/gyms", label: "Gyms" },
  { href: "/admin/promotions", label: "Promotions" },
  { href: "/admin/audit", label: "Audit" },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <PortalNav items={NAV} />
      {children}
    </div>
  );
}
