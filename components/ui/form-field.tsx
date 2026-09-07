import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type FormFieldProps = {
  /** Must match the control's `id` so the label and error wire up for a11y. */
  htmlFor: string;
  label: ReactNode;
  /** Expected-failure text for this field. When set, the field reads as invalid. */
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

export function FormField({
  htmlFor,
  label,
  error,
  hint,
  required,
  className,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
