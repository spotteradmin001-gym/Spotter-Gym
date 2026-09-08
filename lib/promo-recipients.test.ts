import { describe, expect, it } from "vitest";

import {
  type MemberOption,
  resolveRecipients,
  splitContactLines,
} from "./promo-recipients";

const members: MemberOption[] = [
  { id: "a", name: "Ana", phone: "+919800000001", status: "active" },
  { id: "b", name: "Ben", phone: "+919800000002", status: "inactive" },
  { id: "c", name: "Cy", phone: "+919800000003", status: "active" },
];

describe("splitContactLines", () => {
  it("splits on newlines, commas and semicolons and trims blanks", () => {
    expect(
      splitContactLines("  111 ,\n222\n\n; 333 ;"),
    ).toEqual(["111", "222", "333"]);
    expect(splitContactLines("   ")).toEqual([]);
  });
});

describe("resolveRecipients", () => {
  it("resolves selected members to E.164 recipients", () => {
    const r = resolveRecipients({
      selectedMemberIds: ["a", "c"],
      members,
      contactsText: "",
    });
    expect(r.memberCount).toBe(2);
    expect(r.contactCount).toBe(0);
    expect(r.recipients.map((x) => x.phone)).toEqual([
      "+919800000001",
      "+919800000003",
    ]);
    expect(r.recipients.every((x) => x.source === "member")).toBe(true);
  });

  it("normalises pasted contacts and keeps members first", () => {
    const r = resolveRecipients({
      selectedMemberIds: ["a"],
      members,
      contactsText: "9876543210\n+91 91234 56789",
    });
    expect(r.totalCount).toBe(3);
    expect(r.recipients[0]).toMatchObject({ source: "member", memberId: "a" });
    expect(r.recipients.slice(1).map((x) => x.phone)).toEqual([
      "+919876543210",
      "+919123456789",
    ]);
    expect(r.contactCount).toBe(2);
  });

  it("drops a pasted number that belongs to a member (matched, not selected)", () => {
    const r = resolveRecipients({
      selectedMemberIds: [],
      members,
      contactsText: "9800000002",
    });
    expect(r.totalCount).toBe(0);
    expect(r.issues).toEqual([
      { input: "9800000002", reason: "already-a-member" },
    ]);
  });

  it("drops exact duplicates across members and contacts", () => {
    const r = resolveRecipients({
      selectedMemberIds: ["a"],
      members,
      contactsText: "+919800000001\n9877700000\n9877700000",
    });
    // member a, then one fresh contact; the member dupe and the repeat drop
    expect(r.recipients.map((x) => x.phone)).toEqual([
      "+919800000001",
      "+919877700000",
    ]);
    expect(r.issues).toEqual([
      { input: "+919800000001", reason: "already-a-member" },
      { input: "9877700000", reason: "duplicate" },
    ]);
  });

  it("reports unparseable lines instead of losing them", () => {
    const r = resolveRecipients({
      selectedMemberIds: [],
      members,
      contactsText: "not-a-number, 12, 9812345670",
    });
    expect(r.recipients.map((x) => x.phone)).toEqual(["+919812345670"]);
    expect(r.issues).toEqual([
      { input: "not-a-number", reason: "invalid" },
      { input: "12", reason: "invalid" },
    ]);
  });

  it("ignores unknown selected member ids", () => {
    const r = resolveRecipients({
      selectedMemberIds: ["a", "ghost"],
      members,
      contactsText: "",
    });
    expect(r.totalCount).toBe(1);
  });
});
