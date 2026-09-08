"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { formatPaise } from "@/lib/money";
import type { ActionState } from "@/lib/result";

import { pricePromotionAction } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Pricing…" : "Set price"}
    </Button>
  );
}

/**
 * Admin enters the per-message charge (in paise). The page shows the resulting
 * estimate: `per-message × parts-per-recipient × recipients`.
 */
export function PricingForm({
  promotionId,
  partsPerRecipient,
  recipientCount,
  currentPerMessagePaise,
}: {
  promotionId: string;
  partsPerRecipient: number;
  recipientCount: number;
  currentPerMessagePaise: number | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    pricePromotionAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="promotionId" value={promotionId} />
      <FormField
        htmlFor="per-message"
        label="Charge per message (paise)"
        hint={`${partsPerRecipient} part${partsPerRecipient === 1 ? "" : "s"} × ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}. e.g. 50 = ${formatPaise(50)}.`}
        className="flex-1"
      >
        <Input
          id="per-message"
          name="perMessagePaise"
          type="number"
          min={0}
          step={1}
          defaultValue={currentPerMessagePaise ?? ""}
          required
        />
      </FormField>
      <SaveButton />
      {error && (
        <p role="alert" className="text-sm text-destructive sm:w-full">
          {error}
        </p>
      )}
      {state?.ok && (
        <p className="text-sm text-success sm:w-full">Priced.</p>
      )}
    </form>
  );
}
