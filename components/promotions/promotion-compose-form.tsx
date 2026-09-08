"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { fieldStyles } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { DAILY_CAP_NOTICE, type MemberOption } from "@/lib/promo-recipients";
import type { ActionState } from "@/lib/result";

import {
  RecipientBuilder,
  type RecipientBuilderValue,
} from "./recipient-builder";

export type ComposeOutcome = { pending: boolean; promotionId: string };

type ComposeAction = (
  prev: ActionState<ComposeOutcome>,
  form: FormData,
) => Promise<ActionState<ComposeOutcome>>;

/**
 * Compose a promotion: message, optional image, recipients (via the F.3
 * `RecipientBuilder`, which carries the mandatory warning + confirm checkbox).
 * The same form serves the owner and the employee portals — only the server
 * `action` differs. Submit stays disabled until there is at least one recipient
 * and the confirmation is ticked.
 */
export function PromotionComposeForm({
  members,
  mediaEnabled,
  action,
  submitLabel = "Submit for review",
}: {
  members: MemberOption[];
  mediaEnabled: boolean;
  action: ComposeAction;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<ActionState<ComposeOutcome>, FormData>(
    action,
    null,
  );
  const [builder, setBuilder] = useState<RecipientBuilderValue | null>(null);
  const error = state && !state.ok ? state.error : undefined;

  if (state?.ok) {
    return (
      <p className="text-sm text-success">
        {state.data.pending
          ? "Sent to the gym owner for approval."
          : "Submitted for admin review."}
      </p>
    );
  }

  const ready = Boolean(
    builder && builder.confirmed && builder.result.totalCount > 0,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <p className="rounded-md border border-border bg-muted-background p-3 text-xs text-muted">
        {DAILY_CAP_NOTICE}
      </p>

      <FormField
        htmlFor="promo-body"
        label="Message"
        hint="The promotional text WhatsApp sends. Leave blank for an image-only promotion."
      >
        <textarea
          id="promo-body"
          name="body"
          rows={5}
          className={cn(fieldStyles, "h-auto py-2")}
        />
      </FormField>

      {mediaEnabled ? (
        <FormField
          htmlFor="promo-image"
          label="Image (optional)"
          hint="JPEG, PNG or WebP, up to 5 MB. Billed as a second message per recipient."
        >
          <input
            id="promo-image"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm"
          />
        </FormField>
      ) : (
        <p className="text-xs text-muted">
          Image upload is not configured on this server — text-only promotions
          only.
        </p>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">Recipients</p>
        <RecipientBuilder members={members} onChange={setBuilder} />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton label={submitLabel} disabled={!ready} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      {!ready && (
        <p className="text-xs text-muted">
          Pick at least one recipient and tick the confirmation to submit.
        </p>
      )}
    </form>
  );
}

function SubmitButton({ label, disabled }: { label: string; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending}>
      {pending ? "Submitting…" : label}
    </Button>
  );
}
