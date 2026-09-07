"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/result";

import { sendActivationLinkAction, type ActivationLinkResult } from "../actions";

function SendButton({ activated }: { activated: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending || activated} aria-busy={pending}>
      {activated ? "Already has a login" : pending ? "Generating…" : "Send activation link"}
    </Button>
  );
}

export function ActivationPanel({
  memberId,
  activated,
}: {
  memberId: string;
  activated: boolean;
}) {
  const [state, formAction] = useActionState<
    ActionState<ActivationLinkResult>,
    FormData
  >(sendActivationLinkAction, null);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="memberId" value={memberId} />
        <SendButton activated={activated} />
      </form>
      {state?.ok && (
        <div className="rounded-md border border-success/40 bg-muted-background p-3 text-sm">
          {state.data.emailed && <p>Emailed to the member. </p>}
          <p className="break-all">
            Or share this link (valid 7 days):{" "}
            <code className="font-mono">{state.data.link}</code>
          </p>
        </div>
      )}
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}
