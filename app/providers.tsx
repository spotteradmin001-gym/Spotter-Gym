"use client";

import type { ReactNode } from "react";

import { ToastProvider } from "@/components/ui/toast";

/**
 * Client-side context providers mounted once at the root. `children` is passed
 * through as a prop, so Server Components below still render on the server.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
