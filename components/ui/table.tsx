import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/** Table wrapped in a horizontal scroll container so wide tables never push the page. */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
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

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("px-3 py-2 align-middle", className)} {...props} />;
}
