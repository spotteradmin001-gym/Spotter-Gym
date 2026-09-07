/**
 * Integration test for db/queries/members.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name `test_members %`.
 */
import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms, members } from "@/db/schema";
import { createGym, updateGym } from "./gyms";
import {
  MemberError,
  createMember,
  getMember,
  listMembers,
  resolveFeePaise,
  setMemberFee,
  setMemberStatus,
  updateMember,
} from "./members";

describe("resolveFeePaise (pure)", () => {
  it("prefers the member override, then the gym default, then 0", () => {
    expect(resolveFeePaise(150000, 100000)).toBe(150000);
    expect(resolveFeePaise(null, 100000)).toBe(100000);
    expect(resolveFeePaise(null, null)).toBe(0);
    expect(resolveFeePaise(0, 100000)).toBe(0);
  });
});

let gymId = "";
let otherGymId = "";

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_members Main" })).id;
    otherGymId = (await createGym({ name: "test_members Other" })).id;
    await updateGym(gymId, { defaultMonthlyFeePaise: 100000 });
  });
  afterAll(async () => {
    await db.delete(members).where(like(members.name, "test_m %"));
    await db.delete(gyms).where(like(gyms.name, "test_members %"));
    await closeDb();
  });
}

dbSuite("createMember", () => {
  it("normalises the phone and resolves the fee against the gym default", async () => {
    const m = await createMember({
      gymId,
      name: "test_m Priya",
      phone: "07584 928285",
      joinDate: "2026-09-01",
    });
    expect(m.phone).toBe("+917584928285");
    expect(m.monthlyFeePaise).toBeNull();
    expect(m.resolvedFeePaise).toBe(100000);
  });

  it("uses an explicit fee override", async () => {
    const m = await createMember({
      gymId,
      name: "test_m Raj",
      phone: "9999900001",
      joinDate: "2026-09-01",
      monthlyFeePaise: 250000,
    });
    expect(m.resolvedFeePaise).toBe(250000);
  });

  it("rejects a bad phone, a duplicate phone, and a bad date", async () => {
    await expect(
      createMember({ gymId, name: "test_m X", phone: "abc", joinDate: "2026-09-01" }),
    ).rejects.toBeInstanceOf(MemberError);
    await expect(
      createMember({
        gymId,
        name: "test_m Dup",
        phone: "+917584928285",
        joinDate: "2026-09-01",
      }),
    ).rejects.toThrow(/already exists/);
    await expect(
      createMember({ gymId, name: "test_m D", phone: "9998887777", joinDate: "nope" }),
    ).rejects.toThrow(/join date/);
  });
});

dbSuite("listMembers / getMember / scoping", () => {
  it("filters by search and status and stays within the gym", async () => {
    const active = await listMembers(gymId, { status: "active" });
    expect(active.every((m) => m.gymId === gymId && m.status === "active")).toBe(true);

    const byName = await listMembers(gymId, { search: "priya" });
    expect(byName.some((m) => m.name === "test_m Priya")).toBe(true);
  });

  it("getMember won't cross gyms", async () => {
    const [any] = await listMembers(gymId);
    expect((await getMember(otherGymId, any!.id))).toBeNull();
    expect((await getMember(gymId, any!.id))?.id).toBe(any!.id);
  });
});

dbSuite("updates", () => {
  it("setMemberFee override then clear, setMemberStatus, updateMember", async () => {
    const [m] = await listMembers(gymId, { search: "priya" });

    await setMemberFee(gymId, m!.id, 300000);
    expect((await getMember(gymId, m!.id))?.resolvedFeePaise).toBe(300000);
    await setMemberFee(gymId, m!.id, null);
    expect((await getMember(gymId, m!.id))?.resolvedFeePaise).toBe(100000);

    await setMemberStatus(gymId, m!.id, "inactive");
    expect((await getMember(gymId, m!.id))?.status).toBe("inactive");

    await updateMember(gymId, m!.id, { name: "test_m Priya S", billingAnchorDay: 15 });
    const after = await getMember(gymId, m!.id);
    expect(after?.name).toBe("test_m Priya S");
    expect(after?.billingAnchorDay).toBe(15);

    // wrong gym → no-op / error
    await expect(
      updateMember(otherGymId, m!.id, { name: "hacked" }),
    ).rejects.toThrow(/no longer exists/);
  });
});
