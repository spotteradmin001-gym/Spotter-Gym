import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/db/queries";
import { logoutAction } from "@/app/logout/actions";
import { readSessionCookie } from "@/src/features/auth/session-cookie";

/**
 * The route gate for every signed-in page. A Node-runtime Server Component
 * layout (not `middleware.ts`) because the session lookup goes through `pg`,
 * which can't run on Vercel's Edge runtime. Reads the cookie on every request.
 *
 * Role-specific landing areas (`/admin`, `/owner`, `/employee`, `/m`) arrive in
 * Phases 2–5; until then every signed-in user lands on `/dashboard`.
 */
export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser(await readSessionCookie());

  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="font-semibold">Spotter</span>
        <div className="flex min-w-0 items-center gap-3 text-sm">
          <span className="truncate text-muted">
            {user.email} · {user.role}
          </span>
          <form action={logoutAction} className="shrink-0">
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex flex-1 flex-col p-4">{children}</main>
    </div>
  );
}
