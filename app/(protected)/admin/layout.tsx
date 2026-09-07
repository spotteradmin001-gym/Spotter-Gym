import Link from "next/link";

import { requireAdmin } from "@/src/features/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <nav className="flex gap-4 border-b border-border pb-2 text-sm">
        <Link href="/admin/gyms" className="font-medium hover:text-primary">
          Gyms
        </Link>
      </nav>
      {children}
    </div>
  );
}
