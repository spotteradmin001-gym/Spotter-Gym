import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const fieldStyles =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm " +
  "text-card-foreground placeholder:text-muted transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive";

export type InputProps = ComponentProps<"input">;

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <input type={type} className={cn(fieldStyles, className)} {...props} />
  );
}

export { fieldStyles };
