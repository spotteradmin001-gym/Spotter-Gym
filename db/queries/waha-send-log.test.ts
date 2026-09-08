/**
 * Integration test for db/queries/waha-send-log.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset.
 *
 * FIND-MY-FIXTURE: gyms named `test_wsl %`; cleanup deletes the log rows by gym
 * id and the gyms by that prefix.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms, wahaSendLog } from "@/db/schema";

import { createGym, updateGym } from "./gyms";
import {
  getSendCountsForDay,
  promoBudgetForDay,
  recordWahaSends,
} from "./waha-send-log";

let gymId = "";
const DAY = "2026-09-08";

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_wsl Main" })).id;
  });
  afterAll(async () => {
    await db.delete(wahaSendLog).where(eq(wahaSendLog.gymId, gymId));
    await db.delete(gyms).where(like(gyms.name, "test_wsl %"));
    await closeDb();
  });
}

dbSuite("recordWahaSends + getSendCountsForDay", () => {
  it("creates then increments a per-day, per-kind tally", async () => {
    await recordWahaSends({ gymId, kind: "reminder", count: 3, sentOn: DAY });
    await recordWahaSends({ gymId, kind: "reminder", count: 2, sentOn: DAY });
    await recordWahaSends({ gymId, kind: "activation", sentOn: DAY }); // default 1
    await recordWahaSends({ gymId, kind: "promo", count: 10, sentOn: DAY });

    const counts = await getSendCountsForDay(gymId, DAY);
    expect(counts.reminder).toBe(5);
    expect(counts.activation).toBe(1);
    expect(counts.promo).toBe(10);
    expect(counts.transactional).toBe(6);
  });

  it("ignores a non-positive count and isolates other days", async () => {
    await recordWahaSends({ gymId, kind: "promo", count: 0, sentOn: DAY });
    await recordWahaSends({ gymId, kind: "promo", count: -5, sentOn: DAY });
    expect((await getSendCountsForDay(gymId, DAY)).promo).toBe(10);
    expect((await getSendCountsForDay(gymId, "2026-09-09")).promo).toBe(0);
  });
});

dbSuite("promoBudgetForDay", () => {
  it("is cap - reserve - transactional, floored at zero", async () => {
    // defaults: cap 200, reserve 60. transactional on DAY = 6 → 134 left.
    const def = await promoBudgetForDay(gymId, DAY);
    expect(def.dailyCap).toBe(200);
    expect(def.reserve).toBe(60);
    expect(def.transactionalToday).toBe(6);
    expect(def.promoSentToday).toBe(10);
    expect(def.remaining).toBe(134);

    await updateGym(gymId, { wahaDailyCap: 40, transactionalReserve: 60 });
    const tight = await promoBudgetForDay(gymId, DAY);
    expect(tight.remaining).toBe(0); // 40 - 60 - 6 < 0 → 0
  });
});
