"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/cn";
import { isActivePath } from "@/lib/nav";

export type NavItem = { href: string; label: string };

/**
 * Shared staff-portal navigation (owner / admin / employee).
 *
 * - `md` and up: a horizontal inline row of links.
 * - below `md`: a hamburger button that toggles a disclosure panel. No new
 *   dependency — a plain button + conditional list, closed on navigation.
 *
 * Active-link detection is the pure `isActivePath` helper (unit-tested).
 */
export function PortalNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  const current = items.find((item) => isActivePath(pathname, item.href));

  return (
    <nav className="border-b border-border text-sm">
      {/* Desktop: inline row */}
      <div className="hidden flex-wrap gap-4 pb-2 md:flex">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
            className={cn(
              "font-medium hover:text-primary",
              isActivePath(pathname, item.href) && "text-primary",
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Mobile: hamburger + disclosure */}
      <div className="pb-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="portal-nav-drawer"
          className="flex min-h-10 w-full items-center gap-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
          <span>{current?.label ?? "Menu"}</span>
        </button>

        {open && (
          <div id="portal-nav-drawer" className="mt-1 flex flex-col">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={
                  isActivePath(pathname, item.href) ? "page" : undefined
                }
                className={cn(
                  "flex min-h-10 items-center rounded-md px-2 font-medium hover:bg-muted-background",
                  isActivePath(pathname, item.href) && "text-primary",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
