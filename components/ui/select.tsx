import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

import { fieldStyles } from "./input";

export type SelectProps = ComponentProps<"select">;

/** Native select, styled to match Input. Pass <option>s as children. */
export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(fieldStyles, "appearance-none pr-8", className)}
      {...props}
    />
  );
}
