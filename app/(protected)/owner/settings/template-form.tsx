"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/result";
import { renderTemplate, type TemplateKind } from "@/lib/template";

import { saveTemplateAction } from "./actions";

const SAMPLE = { name: "Priya", amount: "₹1,500.00", due_date: "5 Oct 2026" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save message"}
    </Button>
  );
}

export function TemplateForm({
  kind,
  label,
  initialBody,
}: {
  kind: TemplateKind;
  label: string;
  initialBody: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveTemplateAction,
    null,
  );
  const [body, setBody] = useState(initialBody);
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="kind" value={kind} />
      <label htmlFor={`tpl-${kind}`} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={`tpl-${kind}`}
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-input bg-card p-2 text-sm"
      />
      <p className="text-xs text-muted">
        Placeholders: <code>{"{{name}}"}</code> <code>{"{{amount}}"}</code>{" "}
        <code>{"{{due_date}}"}</code>
      </p>
      <div className="rounded-md border border-border bg-muted-background p-2 text-sm">
        <span className="text-xs text-muted">Preview: </span>
        {renderTemplate(body, SAMPLE)}
      </div>
      <div className="flex items-center gap-3">
        <SaveButton />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {state?.ok && <p className="text-sm text-success">Saved.</p>}
      </div>
    </form>
  );
}
