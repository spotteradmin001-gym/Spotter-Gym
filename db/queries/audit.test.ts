/**
 * Integration test for db/queries/audit.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: action `test_audit.*`.
 */
import { like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { audits, gyms, users } from "@/db/schema";
import { listAudits, writeAudit } from "./audit";
import { createGym } from "./gyms";

let gymId = "";
let actorId = "";

if (process.env.DATABASE_URL) {
  afterAll(async () => {
    await db.delete(audits).where(like(audits.action, "test_audit.%"));
    await db.delete(users).where(like(users.email, "test_audit_%"));
    await db.delete(gyms).where(like(gyms.name, "test_audit %"));
    await closeDb();
  });
}

dbSuite("audit", () => {
  it("writes an entry and lists it, gym-scoped, with the actor email joined", async () => {
    gymId = (await createGym({ name: "test_audit Gym" })).id;
    const [u] = await db
      .insert(users)
      .values({
        email: "test_audit_actor@example.com",
        role: "owner",
        gymId,
        passwordHash: "x:y",
        mustChangePassword: false,
      })
      .returning({ id: users.id });
    actorId = u!.id;

    await writeAudit({
      actorUserId: actorId,
      actorRole: "owner",
      gymId,
      action: "test_audit.payment.record",
      targetType: "member",
      targetId: "m-123",
      meta: { amountPaise: 100000 },
    });

    const gymEntries = await listAudits({ gymId, limit: 50 });
    const mine = gymEntries.find((e) => e.action === "test_audit.payment.record");
    expect(mine).toBeTruthy();
    expect(mine?.actorEmail).toBe("test_audit_actor@example.com");
    expect(mine?.meta).toEqual({ amountPaise: 100000 });

    // a different gym doesn't see it
    const other = (await createGym({ name: "test_audit Other" })).id;
    const otherEntries = await listAudits({ gymId: other, limit: 50 });
    expect(otherEntries.some((e) => e.action === "test_audit.payment.record")).toBe(false);
  });

  it("never throws, even on a bad actor id", async () => {
    await expect(
      writeAudit({
        actorUserId: "00000000-0000-0000-0000-000000000000",
        actorRole: "owner",
        gymId,
        action: "test_audit.noop",
        targetType: "none",
      }),
    ).resolves.toBeUndefined();
  });
});
