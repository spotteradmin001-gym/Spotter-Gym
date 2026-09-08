"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/result";

import { sendReminderNowAction } from "../../reminders/actions";

function Btn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending} aria-busy={pending}>
      {pending ? "Queuing…" : "Send reminder now"}
    </Button>
  );
}

export function SendReminderNow({ memberId }: { memberId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    sendReminderNowAction,
    null,
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="memberId" value={memberId} />
      <Btn />
      {state?.ok && <p className="text-sm text-success">Queued — the engine sends it on its next run.</p>}
      {state && !state.ok && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
