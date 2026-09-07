import Link from "next/link";

import { logoutAction } from "@/app/logout/actions";
import { requireMemberSelf } from "@/src/features/auth/member-scope";

export const dynamic = "force-dynamic";

/** Mobile-first member shell. The profile gate lives on each page (via `requireCompleteProfile`). */
export default async function MemberLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireMemberSelf();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <header className="flex items-center justify-between border-b border-border pb-2">
        <span className="font-semibold">Spotter</span>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted hover:text-foreground">
            Sign out
          </button>
        </form>
      </header>
      <nav className="flex gap-4 text-sm">
        <Link href="/m" className="font-medium hover:text-primary">Home</Link>
        <Link href="/m/payments" className="font-medium hover:text-primary">Payments</Link>
        <Link href="/m/profile" className="font-medium hover:text-primary">Profile</Link>
      </nav>
      {children}
    </div>
  );
}
