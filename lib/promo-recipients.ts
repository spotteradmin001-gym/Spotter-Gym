/**
 * Promotion recipient resolution (Phase F / CR-10) — pure, no I/O.
 *
 * Two sources only (guardrail 1): the gym's own members, and "known contacts"
 * the owner types or pastes — people they already message on WhatsApp. This
 * module takes the ticked member ids + the raw contacts text and produces the
 * final, deduped E.164 list, plus a per-line report for the UI.
 *
 * Rules:
 *   - every pasted number is normalised through `lib/phone.ts`;
 *   - a pasted number that matches any gym member is dropped (the members
 *     source already covers them — `changes.md` decision B);
 *   - exact duplicates (across members and contacts) are dropped;
 *   - unparseable lines are reported, not silently lost.
 *
 * The engine's WhatsApp-existence precheck (guardrail 3) happens later, per
 * recipient, in `engine/send-promotions.mjs`.
 */
import { normalizePhone, PhoneError } from "./phone";

/** Shown on the known-contacts field and again on the submit confirmation. */
export const KNOWN_CONTACTS_WARNING =
  "Only add numbers you already message on WhatsApp. Unknown numbers can get your gym's WhatsApp number banned.";

/** Shown on the compose screen so the owner expects a multi-day send. */
export const DAILY_CAP_NOTICE =
  "Your gym's WhatsApp number can safely send about 200 messages per day in total. Payment reminders and new-member messages use part of that. Large promotions are delivered over several days.";

export type RecipientSource = "member" | "contact";

export type MemberOption = {
  id: string;
  name: string;
  /** As stored — E.164. */
  phone: string;
  status: "active" | "inactive";
};

export type ResolvedRecipient = {
  phone: string;
  source: RecipientSource;
  memberId: string | null;
  /** Member name, or null for a known contact. */
  name: string | null;
};

export type ContactLineIssue = {
  input: string;
  reason: "invalid" | "duplicate" | "already-a-member";
};

export type ResolveInput = {
  selectedMemberIds: string[];
  /** Every member of the gym (from `listMembers`) — for phone lookup + matching. */
  members: MemberOption[];
  /** Raw text from the known-contacts textarea. */
  contactsText: string;
};

export type ResolveResult = {
  /** Deduped, members first then contacts, in input order. */
  recipients: ResolvedRecipient[];
  memberCount: number;
  contactCount: number;
  totalCount: number;
  /** Rejected or dropped pasted lines, for inline UI feedback. */
  issues: ContactLineIssue[];
};

/** Split a pasted blob on newlines, commas and semicolons; trim; drop blanks. */
export function splitContactLines(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function safeNormalise(raw: string): string | null {
  try {
    return normalizePhone(raw);
  } catch (error) {
    if (error instanceof PhoneError) return null;
    throw error;
  }
}

export function resolveRecipients(input: ResolveInput): ResolveResult {
  const membersById = new Map(input.members.map((m) => [m.id, m]));

  // Every member phone, normalised, → the member. Used to drop pasted numbers
  // that are really members.
  const memberByPhone = new Map<string, MemberOption>();
  for (const m of input.members) {
    const e164 = safeNormalise(m.phone);
    if (e164) memberByPhone.set(e164, m);
  }

  const recipients: ResolvedRecipient[] = [];
  const issues: ContactLineIssue[] = [];
  const seen = new Set<string>();

  // 1) selected members
  for (const id of input.selectedMemberIds) {
    const member = membersById.get(id);
    if (!member) continue;
    const e164 = safeNormalise(member.phone);
    if (!e164 || seen.has(e164)) continue;
    seen.add(e164);
    recipients.push({
      phone: e164,
      source: "member",
      memberId: member.id,
      name: member.name,
    });
  }

  // 2) known contacts
  for (const line of splitContactLines(input.contactsText)) {
    const e164 = safeNormalise(line);
    if (!e164) {
      issues.push({ input: line, reason: "invalid" });
      continue;
    }
    if (memberByPhone.has(e164)) {
      issues.push({ input: line, reason: "already-a-member" });
      continue;
    }
    if (seen.has(e164)) {
      issues.push({ input: line, reason: "duplicate" });
      continue;
    }
    seen.add(e164);
    recipients.push({
      phone: e164,
      source: "contact",
      memberId: null,
      name: null,
    });
  }

  const memberCount = recipients.filter((r) => r.source === "member").length;
  return {
    recipients,
    memberCount,
    contactCount: recipients.length - memberCount,
    totalCount: recipients.length,
    issues,
  };
}
