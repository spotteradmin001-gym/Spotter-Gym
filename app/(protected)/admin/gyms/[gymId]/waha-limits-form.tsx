"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/result";

import { updateGymSendLimitsAction } from "../../actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}

/**
 * Admin-only WhatsApp sending limits for a gym (CR-10). Promo budget for a day
 * = daily cap − reserve − today's reminder + activation sends.
 */
export function WahaLimitsForm({
  gymId,
  wahaDailyCap,
  transactionalReserve,
}: {
  gymId: string;
  wahaDailyCap: number;
  transactionalReserve: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateGymSendLimitsAction,
    null,
  );
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="gymId" value={gymId} />
      <FormField
        htmlFor="waha-daily-cap"
        label="Daily cap"
        hint="Total WhatsApp messages/day. 200 for a warmed number, ~40 for a fresh one."
        className="flex-1"
      >
        <Input
          id="waha-daily-cap"
          name="wahaDailyCap"
          type="number"
          min={1}
          max={2000}
          step={1}
          defaultValue={wahaDailyCap}
        />
      </FormField>
      <FormField
        htmlFor="transactional-reserve"
        label="Transactional reserve"
        hint="Held back for reminders + activation. Promotions can never use it."
        className="flex-1"
      >
        <Input
          id="transactional-reserve"
          name="transactionalReserve"
          type="number"
          min={0}
          max={2000}
          step={1}
          defaultValue={transactionalReserve}
        />
      </FormField>
      <SaveButton />
      {error && (
        <p role="alert" className="text-sm text-destructive sm:w-full">
          {error}
        </p>
      )}
      {state?.ok && <p className="text-sm text-success sm:w-full">Saved.</p>}
    </form>
  );
}
