/**
 * Integration test for db/queries/dues.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name `test_dues %`.
 */
import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms, members } from "@/db/schema";
import { generateDuesForGym, listDuesForMember } from "./dues";
import { createGym, updateGym } from "./gyms";
import { createMember, setMemberStatus } from "./members";

let gymId = "";
const AS_OF = new Date("2026-09-10T00:00:00Z");

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_dues Gym" })).id;
    await updateGym(gymId, {
      defaultMonthlyFeePaise: 120000,
      billingAnchorMode: "fixed",
      billingAnchorDay: 5,
    });
  });
  afterAll(async () => {
    await db.delete(members).where(like(members.name, "test_dues %"));
    await db.delete(gyms).where(like(gyms.name, "test_dues %"));
    await closeDb();
  });
}

dbSuite("generateDuesForGym", () => {
  it("creates the current + next period at the resolved fee, and is idempotent", async () => {
    const m = await createMember({
      gymId,
      name: "test_dues Alice",
      phone: "9000000001",
      joinDate: "2026-01-01",
    });

    const first = await generateDuesForGym(gymId, AS_OF);
    expect(first.created).toBe(2);

    const rows = await listDuesForMember(gymId, m.id);
    expect(rows.map((d) => d.periodMonth).sort()).toEqual([
      "2026-09-01",
      "2026-10-01",
    ]);
    expect(rows.every((d) => d.amountDuePaise === 120000)).toBe(true);
    expect(rows.every((d) => d.dueDate.endsWith("-05"))).toBe(true);

    const second = await generateDuesForGym(gymId, AS_OF);
    expect(second.created).toBe(0);
  });

  it("skips inactive members", async () => {
    const m = await createMember({
      gymId,
      name: "test_dues Bob",
      phone: "9000000002",
      joinDate: "2026-01-01",
    });
    await setMemberStatus(gymId, m.id, "inactive");

    await generateDuesForGym(gymId, AS_OF);
    expect(await listDuesForMember(gymId, m.id)).toHaveLength(0);
  });

  it("does not prorate a member who joined mid-period", async () => {
    const m = await createMember({
      gymId,
      name: "test_dues Carol",
      phone: "9000000003",
      joinDate: "2026-09-20", // after the 5th → no September due
    });

    await generateDuesForGym(gymId, AS_OF);
    const rows = await listDuesForMember(gymId, m.id);
    expect(rows.map((d) => d.periodMonth)).toEqual(["2026-10-01"]);
  });

  it("uses the member's own anchor day when the gym bills per-member", async () => {
    await updateGym(gymId, { billingAnchorMode: "per_member" });
    const m = await createMember({
      gymId,
      name: "test_dues Dave",
      phone: "9000000004",
      joinDate: "2026-01-01",
      billingAnchorDay: 15,
    });

    await generateDuesForGym(gymId, AS_OF);
    const rows = await listDuesForMember(gymId, m.id);
    expect(rows.every((d) => d.dueDate.endsWith("-15"))).toBe(true);
    await updateGym(gymId, { billingAnchorMode: "fixed" });
  });
});
