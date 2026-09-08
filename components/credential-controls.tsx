"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { ShareViaWhatsApp } from "@/components/share-via-whatsapp";
import { Button } from "@/components/ui/button";
import {
  credentialControlsView,
  type ResetResult,
  type RevealResult,
} from "@/lib/credential-ui";
import type { ActionState } from "@/lib/result";
import type { UserRole } from "@/db/queries";

export type { ResetResult, RevealResult };

/**
 * "Show temp password" + "Reset password" for one staff account (CR-6).
 *
 * Reveal and reset are separate server actions (bound per portal — admin vs
 * owner — so each carries its own guard and revalidation). This component only
 * renders the buttons and their one-time results, and decides what to show from
 * `credentialControlsView`.
 *
 * The reset result's "Share via WhatsApp" sends the reset LINK, never the raw
 * password.
 */

type ActionFn<T> = (
  prev: ActionState<T>,
  formData: FormData,
) => Promise<ActionState<T>>;

function PendingButton({
  idle,
  busy,
  variant = "secondary",
}: {
  idle: string;
  busy: string;
  variant?: "secondary" | "ghost";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size="sm"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? busy : idle}
    </Button>
  );
}

export function CredentialControls({
  targetUserId,
  targetRole,
  phone,
  vaultEnabled,
  revealAction,
  resetAction,
  extraFields,
}: {
  targetUserId: string;
  targetRole: UserRole;
  phone: string | null | undefined;
  vaultEnabled: boolean;
  /** Omit for accounts where reveal never applies (members). */
  revealAction?: ActionFn<RevealResult>;
  resetAction: ActionFn<ResetResult>;
  /** Extra hidden inputs both forms submit (e.g. `gymId` for revalidation). */
  extraFields?: Record<string, string>;
}) {
  const view = credentialControlsView({ targetRole, vaultEnabled });

  const [revealState, revealFormAction] = useActionState<
    ActionState<RevealResult>,
    FormData
  >(revealAction ?? (async () => null), null);
  const [resetState, resetFormAction] = useActionState<
    ActionState<ResetResult>,
    FormData
  >(resetAction, null);

  const hidden = (
    <>
      <input type="hidden" name="targetUserId" value={targetUserId} />
      {extraFields &&
        Object.entries(extraFields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
    </>
  );

  const revealError =
    revealState && !revealState.ok ? revealState.error : undefined;
  const resetError = resetState && !resetState.ok ? resetState.error : undefined;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {view.showReveal && revealAction && (
          <form action={revealFormAction}>
            {hidden}
            <PendingButton idle="Show temp password" busy="Loading…" />
          </form>
        )}
        {view.showReset && (
          <form action={resetFormAction}>
            {hidden}
            <PendingButton
              idle="Reset password"
              busy="Resetting…"
              variant="ghost"
            />
          </form>
        )}
      </div>

      {view.revealDisabledReason === "vault-off" && (
        <p className="text-xs text-muted">
          Set <code className="font-mono">CREDENTIAL_ENC_KEY</code> to enable
          viewing saved temporary passwords. Reset still works.
        </p>
      )}

      {revealError && (
        <p role="alert" className="text-destructive">
          {revealError}
        </p>
      )}
      {revealState?.ok && (
        <p>
          {revealState.data.password ? (
            <>
              Temporary password:{" "}
              <code className="rounded bg-card px-1 py-0.5 font-mono">
                {revealState.data.password}
              </code>
            </>
          ) : (
            <span className="text-muted">
              No temporary password is stored — the account holder has already
              set their own.
            </span>
          )}
        </p>
      )}

      {resetError && (
        <p role="alert" className="text-destructive">
          {resetError}
        </p>
      )}
      {resetState?.ok && (
        <div className="flex flex-col gap-2 rounded-md border border-success/40 bg-muted-background p-3">
          <p>
            New temporary password (shown once — copy it now):{" "}
            <code className="rounded bg-card px-1 py-0.5 font-mono">
              {resetState.data.password}
            </code>
          </p>
          <p className="text-muted">
            Existing sessions were signed out; they&apos;ll set their own
            password on next sign-in.
          </p>
          <p className="break-all text-xs">
            Reset link: <code className="font-mono">{resetState.data.resetLink}</code>
          </p>
          <ShareViaWhatsApp
            phone={phone}
            message={resetState.data.shareMessage}
            className="self-start"
          >
            Share reset link via WhatsApp
          </ShareViaWhatsApp>
        </div>
      )}
    </div>
  );
}
