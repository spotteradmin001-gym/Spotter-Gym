"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  selectedOwnerPhone,
  type OwnerContact,
} from "@/lib/promo-owner-contact";
import { waLink } from "@/lib/wa-link";

/**
 * The "Send quote / bill via WhatsApp" controls on the admin promotion page.
 *
 * - 0 owners with a phone → both buttons disabled with a note.
 * - exactly 1 → no dropdown, the link targets that owner (unchanged behaviour).
 * - more than 1 → a `<select>` of owners (email + masked phone) above the
 *   buttons; the `wa.me` link is rebuilt in the browser from the chosen owner.
 */
export function OwnerContactPicker({
  choices,
  quoteMessage,
  billMessage,
}: {
  choices: OwnerContact[];
  quoteMessage: string | null;
  billMessage: string | null;
}) {
  const [selectedId, setSelectedId] = useState(choices[0]?.id ?? "");

  if (choices.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled>
            Send quote via WhatsApp
          </Button>
          <Button size="sm" variant="secondary" disabled>
            Send bill via WhatsApp
          </Button>
        </div>
        <p className="text-sm text-muted">No owner phone on file.</p>
      </div>
    );
  }

  const phone = selectedOwnerPhone(choices, selectedId);
  const quoteHref = quoteMessage ? waLink(phone, quoteMessage) : null;
  const billHref = billMessage ? waLink(phone, billMessage) : null;

  return (
    <div className="flex flex-col gap-2">
      {choices.length > 1 && (
        <label className="flex max-w-sm flex-col gap-1 text-sm">
          <span className="text-muted">Send to owner</span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap gap-2">
        {quoteHref && (
          <a href={quoteHref} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">
              Send quote via WhatsApp
            </Button>
          </a>
        )}
        {billHref && (
          <a href={billHref} target="_blank" rel="noreferrer">
            <Button size="sm" variant="secondary">
              Send bill via WhatsApp
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}
