/**
 * Integration test for db/queries/reminders.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name
 * `test_rem %`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { dues, gyms, members, reminderJobs } from "@/db/schema";
import { generateDuesForGym } from "./dues";
import { createGym, updateGym } from "./gyms";
import { createMember, setMemberStatus } from "./members";
import {
  ReminderError,
  listReminderJobs,
  planRemindersForGym,
  queueImmediateReminder,
  reminderCounts,
  requeueReminderJob,
} from "./reminders";

let gymId = "";
const AS_OF = new Date("2026-09-01T00:00:00Z");

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_rem Gym" })).id;
    await updateGym(gymId, {
      defaultMonthlyFeePaise: 100000,
      billingAnchorMode: "fixed",
      billingAnchorDay: 10,
      reminderDaysBefore: 3,
      wahaSessionName: "test_rem_session",
    });
  });
  afterAll(async () => {
    const ids = (
      await db.select({ id: members.id }).from(members).where(eq(members.gymId, gymId))
    ).map((r) => r.id);
    for (const id of ids) {
      await db.delete(reminderJobs).where(eq(reminderJobs.memberId, id));
      await db.delete(dues).where(eq(dues.memberId, id));
    }
    await db.delete(members).where(like(members.name, "test_rem %"));
    await db.delete(gyms).where(like(gyms.name, "test_rem %"));
    await closeDb();
  });
}

dbSuite("planRemindersForGym", () => {
  it("creates one pre_due + one on_due per pending due, and is idempotent", async () => {
    const m = await createMember({
      gymId,
      name: "test_rem Meera",
      phone: "9700000001",
      joinDate: "2026-01-01",
    });
    await generateDuesForGym(gymId, AS_OF); // Sep 10 + Oct 10 dues

    const first = await planRemindersForGym(gymId, AS_OF);
    expect(first.created).toBe(4); // 2 dues × 2 kinds

    const jobs = await listReminderJobs(gymId, { memberId: m.id });
    const sep = jobs.filter((j) => j.scheduledFor.startsWith("2026-09"));
    expect(sep.map((j) => `${j.kind}:${j.scheduledFor}`).sort()).toEqual([
      "on_due:2026-09-10",
      "pre_due:2026-09-07",
    ]);
    expect(jobs.every((j) => j.status === "pending")).toBe(true);

    const second = await planRemindersForGym(gymId, AS_OF);
    expect(second.created).toBe(0);
  });

  it("skips a member with no WAHA-sendable state and marks existing jobs skipped", async () => {
    const m = await createMember({
      gymId,
      name: "test_rem Gone",
      phone: "9700000002",
      joinDate: "2026-01-01",
    });
    await generateDuesForGym(gymId, AS_OF);
    await planRemindersForGym(gymId, AS_OF); // jobs created

    await setMemberStatus(gymId, m.id, "inactive");
    const r = await planRemindersForGym(gymId, AS_OF);
    expect(r.skipped).toBeGreaterThanOrEqual(2);

    const jobs = await listReminderJobs(gymId, { memberId: m.id });
    expect(jobs.every((j) => j.status === "skipped")).toBe(true);
  });

  it("creates nothing when the gym has no WAHA session", async () => {
    await updateGym(gymId, { wahaSessionName: null });
    const m = await createMember({
      gymId,
      name: "test_rem NoSession",
      phone: "9700000003",
      joinDate: "2026-01-01",
    });
    await generateDuesForGym(gymId, AS_OF);
    const r = await planRemindersForGym(gymId, AS_OF);
    void r;
    expect(await listReminderJobs(gymId, { memberId: m.id })).toHaveLength(0);
    await updateGym(gymId, { wahaSessionName: "test_rem_session" });
  });
});

dbSuite("status visibility", () => {
  it("requeueReminderJob re-arms a non-sent job; counts + queueImmediateReminder work", async () => {
    const m = await createMember({
      gymId,
      name: "test_rem Status",
      phone: "9700000009",
      joinDate: "2026-01-01",
    });
    await generateDuesForGym(gymId, AS_OF);
    await planRemindersForGym(gymId, AS_OF);

    const jobs = await listReminderJobs(gymId, { memberId: m.id });
    const job = jobs[0]!;
    // mark it failed, then re-queue
    await db
      .update(reminderJobs)
      .set({ status: "failed", error: "boom" })
      .where(eq(reminderJobs.id, job.id));
    await requeueReminderJob(gymId, job.id);
    const after = (await listReminderJobs(gymId, { memberId: m.id })).find(
      (j) => j.id === job.id,
    );
    expect(after?.status).toBe("pending");
    expect(after?.error).toBeNull();

    const counts = await reminderCounts(gymId, AS_OF);
    expect(counts.pending).toBeGreaterThan(0);

    // immediate reminder re-arms the on_due job for the soonest due, scheduled today
    await queueImmediateReminder(gymId, m.id, new Date("2026-09-15T00:00:00Z"));
    const all = await listReminderJobs(gymId, { memberId: m.id });
    expect(
      all.some(
        (j) =>
          j.kind === "on_due" &&
          j.scheduledFor === "2026-09-15" &&
          j.status === "pending",
      ),
    ).toBe(true);
  });

  it("queueImmediateReminder throws when the member has nothing pending", async () => {
    const m = await createMember({
      gymId,
      name: "test_rem Clear",
      phone: "9700000010",
      joinDate: "2026-01-01",
    });
    // no dues generated for this member's future — but generateDuesForGym covers
    // everyone; mark them all paid via a direct update for the test
    await generateDuesForGym(gymId, AS_OF);
    await db
      .update(dues)
      .set({ status: "paid" })
      .where(eq(dues.memberId, m.id));

    await expect(queueImmediateReminder(gymId, m.id)).rejects.toBeInstanceOf(
      ReminderError,
    );
  });
});
