import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

type TableVariant = "scroll" | "stacked";

export type TableProps = ComponentProps<"table"> & {
  /**
   * How the table behaves below the `sm` breakpoint:
   * - `"scroll"` (default): the desktop `<table>` stays, wrapped in a
   *   horizontal scroll container. Keep this for wide numeric tables
   *   (P&L, payments) where column alignment carries meaning.
   * - `"stacked"`: each row collapses to a labelled card. Give every `TD`
   *   a `label` (or `data-label`) so each cell keeps its column name.
   */
  variant?: TableVariant;
};

/**
 * Desktop tables that stay usable on a phone.
 *
 * Above `sm` both variants render an ordinary `<table>`. Below `sm`,
 * `variant="stacked"` turns each row into a card with per-cell labels
 * (styled in `app/globals.css` off the `table-stacked` class), while
 * `variant="scroll"` keeps the table and lets it scroll sideways.
 */
export function Table({ className, variant = "scroll", ...props }: TableProps) {
  return (
    <div className={cn("w-full", variant === "scroll" && "overflow-x-auto")}>
      <table
        className={cn(
          "w-full caption-bottom text-sm",
          variant === "stacked" && "table-stacked",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn("border-b border-border text-left text-muted", className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return (
    <tbody
      className={cn("[&_tr:not(:last-child)]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr className={cn("hover:bg-muted-background/60", className)} {...props} />
  );
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={cn("px-3 py-2 font-medium whitespace-nowrap", className)}
      {...props}
    />
  );
}

export type TDProps = ComponentProps<"td"> & {
  /**
   * Column name shown beside this cell in the mobile stacked-card layout
   * (`Table variant="stacked"`). Ignored above `sm`. Sets `data-label`.
   */
  label?: string;
};

export function TD({ className, label, ...props }: TDProps) {
  return (
    <td
      className={cn("px-3 py-2 align-middle", className)}
      data-label={label}
      {...props}
    />
  );
}
