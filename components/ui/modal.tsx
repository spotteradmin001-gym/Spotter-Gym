"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Built on the native <dialog> element: it gives us the top layer, a focus
 * trap, Esc-to-close and a `::backdrop` for free. We mirror `open` into
 * showModal()/close() and translate the element's own close events back into
 * `onClose` so the parent stays the single source of truth.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Click on the backdrop = click on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border " +
          "bg-card p-0 text-card-foreground shadow-lg backdrop:bg-black/50",
        className,
      )}
    >
      {open && (
        <div className="flex flex-col">
          {(title || description) && (
            <div className="flex flex-col gap-1 border-b border-border p-4">
              {title && <h2 className="text-base font-semibold">{title}</h2>}
              {description && (
                <p className="text-sm text-muted">{description}</p>
              )}
            </div>
          )}
          {children && <div className="p-4">{children}</div>}
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border p-4">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
