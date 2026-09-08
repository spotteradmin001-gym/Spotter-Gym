"use client";

import { useEffect, useMemo, useState } from "react";

import { fieldStyles } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  KNOWN_CONTACTS_WARNING,
  type MemberOption,
  resolveRecipients,
  type ResolveResult,
} from "@/lib/promo-recipients";

type ContactPickerNavigator = Navigator & {
  contacts?: {
    select: (
      properties: string[],
      options?: { multiple?: boolean },
    ) => Promise<Array<{ tel?: string[] }>>;
  };
};

function contactPicker(): ContactPickerNavigator["contacts"] | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as ContactPickerNavigator;
  return "contacts" in nav && "ContactsManager" in window
    ? nav.contacts
    : undefined;
}

const issueLabel: Record<ResolveResult["issues"][number]["reason"], string> = {
  invalid: "not a valid number",
  duplicate: "already in the list",
  "already-a-member": "already a member — select them above instead",
};

export type RecipientBuilderValue = {
  result: ResolveResult;
  confirmed: boolean;
};

/**
 * Member multi-select (grouped active / inactive) + a known-contacts field,
 * with the mandatory warning banner and confirmation checkbox (CR-10
 * guardrails 1 & 2). Resolution is previewed live via the same pure
 * `resolveRecipients` the server action re-runs on submit.
 *
 * Emits one hidden input (`name`, default `recipients`) carrying
 * `{ memberIds, contactsText, confirmed }` as JSON.
 */
export function RecipientBuilder({
  members,
  name = "recipients",
  onChange,
}: {
  members: MemberOption[];
  name?: string;
  onChange?: (value: RecipientBuilderValue) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [contactsText, setContactsText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const active = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members],
  );
  const inactive = useMemo(
    () => members.filter((m) => m.status === "inactive"),
    [members],
  );

  const result = useMemo(
    () => resolveRecipients({ selectedMemberIds: selectedIds, members, contactsText }),
    [selectedIds, members, contactsText],
  );

  useEffect(() => {
    onChange?.({ result, confirmed });
  }, [result, confirmed, onChange]);

  const selected = new Set(selectedIds);

  function toggle(id: string) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  function setGroup(group: MemberOption[], on: boolean) {
    const ids = group.map((m) => m.id);
    setSelectedIds((cur) =>
      on
        ? [...new Set([...cur, ...ids])]
        : cur.filter((x) => !ids.includes(x)),
    );
  }

  async function pickFromContacts() {
    const picker = contactPicker();
    if (!picker) return;
    setPickerError(null);
    try {
      const picked = await picker.select(["tel"], { multiple: true });
      const tels = picked.flatMap((c) => c.tel ?? []);
      if (tels.length > 0) {
        setContactsText((cur) => (cur ? `${cur}\n${tels.join("\n")}` : tels.join("\n")));
      }
    } catch {
      setPickerError("Could not open your contacts. Type or paste the numbers instead.");
    }
  }

  const payload = JSON.stringify({
    memberIds: selectedIds,
    contactsText,
    confirmed,
  });

  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name={name} value={payload} readOnly />

      <MemberGroup
        title="Active members"
        group={active}
        selected={selected}
        onToggle={toggle}
        onSetAll={(on) => setGroup(active, on)}
      />
      <MemberGroup
        title="Inactive members"
        group={inactive}
        selected={selected}
        onToggle={toggle}
        onSetAll={(on) => setGroup(inactive, on)}
      />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${name}-contacts`} className="text-sm font-medium">
            Known contacts
          </label>
          {contactPicker() && (
            <button
              type="button"
              onClick={pickFromContacts}
              className="text-xs font-medium text-primary underline"
            >
              Pick from contacts
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          One number per line (or comma-separated). Local or +country format.
        </p>
        <textarea
          id={`${name}-contacts`}
          value={contactsText}
          onChange={(e) => setContactsText(e.target.value)}
          rows={4}
          className={cn(fieldStyles, "h-auto py-2 font-mono")}
          placeholder={"98765 43210\n+91 91234 56789"}
        />
        {pickerError && (
          <p className="text-xs text-destructive">{pickerError}</p>
        )}
      </div>

      <div
        role="note"
        className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
      >
        {KNOWN_CONTACTS_WARNING}
      </div>

      {result.issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {result.issues.map((issue, i) => (
            <li key={`${issue.input}-${i}`}>
              <span className="font-mono">{issue.input || "(blank)"}</span>{" "}
              — {issueLabel[issue.reason]}
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm">
        <strong>{result.totalCount}</strong> recipient
        {result.totalCount === 1 ? "" : "s"}
        {" — "}
        {result.memberCount} member{result.memberCount === 1 ? "" : "s"},{" "}
        {result.contactCount} contact{result.contactCount === 1 ? "" : "s"}.
      </p>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          I only added numbers I already message on WhatsApp, and I understand
          large promotions are delivered over several days.
        </span>
      </label>
    </div>
  );
}

function MemberGroup({
  title,
  group,
  selected,
  onToggle,
  onSetAll,
}: {
  title: string;
  group: MemberOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSetAll: (on: boolean) => void;
}) {
  if (group.length === 0) return null;
  const allOn = group.every((m) => selected.has(m.id));
  const count = group.filter((m) => selected.has(m.id)).length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {title}{" "}
          <span className="text-muted">
            ({count}/{group.length})
          </span>
        </span>
        <button
          type="button"
          onClick={() => onSetAll(!allOn)}
          className="text-xs font-medium text-primary underline"
        >
          {allOn ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-md border border-border">
        {group.map((m) => (
          <label
            key={m.id}
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(m.id)}
              onChange={() => onToggle(m.id)}
              className="h-4 w-4"
            />
            <span className="flex-1">{m.name}</span>
            <span className="font-mono text-xs text-muted">{m.phone}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
