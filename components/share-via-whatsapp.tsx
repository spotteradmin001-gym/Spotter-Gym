"use client";

import { cn } from "@/lib/cn";
import { waLink } from "@/lib/wa-link";

/**
 * "Share via WhatsApp" (CR-7): opens WhatsApp with the recipient and a
 * pre-filled message. The human presses Send from their own WhatsApp — no
 * server send. Renders nothing when there is no usable phone on file.
 */
export function ShareViaWhatsApp({
  phone,
  message,
  children = "Share via WhatsApp",
  className,
}: {
  phone: string | null | undefined;
  message: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const href = waLink(phone, message);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border " +
          "bg-card px-3 text-sm font-medium text-card-foreground transition-colors " +
          "hover:bg-muted-background focus-visible:outline-none focus-visible:ring-2 " +
          "focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="#25D366" aria-hidden="true">
        <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.42 5.83c0 4.54-3.7 8.24-8.25 8.24-1.5 0-2.97-.4-4.25-1.16l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.37c0-4.54 3.7-8.24 8.24-8.24z" />
      </svg>
      {children}
    </a>
  );
}
