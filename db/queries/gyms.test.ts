/**
 * Integration test for db/queries/gyms.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset.
 *
 * FIND-MY-FIXTURE: every row this file makes is named `test_gym_*`; cleanup
 * deletes by that prefix. No list-length or count assertions.
 */
import { like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms } from "@/db/schema";
import {
  GymError,
  createGym,
  getGym,
  listGyms,
  setGymActive,
  updateGym,
} from "./gyms";

if (process.env.DATABASE_URL) {
  afterAll(async () => {
    await db.delete(gyms).where(like(gyms.name, "test_gym_%"));
    await closeDb();
  });
}

dbSuite("createGym", () => {
  it("creates with a slug and the default timezone", async () => {
    const gym = await createGym({ name: "test_gym Powerhouse" });
    expect(gym.slug).toBe("test-gym-powerhouse");
    expect(gym.timezone).toBe("Asia/Kolkata");
    expect(gym.isActive).toBe(true);
    expect(gym.reminderDaysBefore).toBe(3);
    expect(gym.checkinRadiusM).toBe(100);
  });

  it("makes a distinct slug when the base is taken", async () => {
    const a = await createGym({ name: "test_gym Iron" });
    const b = await createGym({ name: "test_gym Iron" });
    expect(a.slug).toBe("test-gym-iron");
    expect(b.slug).toBe("test-gym-iron-2");
  });

  it("rejects a blank name and a bad timezone", async () => {
    await expect(createGym({ name: " " })).rejects.toBeInstanceOf(GymError);
    await expect(
      createGym({ name: "test_gym TZ", timezone: "Nowhere" }),
    ).rejects.toThrow(/timezone/);
  });
});

dbSuite("getGym / listGyms", () => {
  it("getGym returns the row, or null for an unknown id", async () => {
    const gym = await createGym({ name: "test_gym Lookup" });
    expect((await getGym(gym.id))?.id).toBe(gym.id);
    expect(await getGym("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("listGyms hides inactive unless asked", async () => {
    const gym = await createGym({ name: "test_gym Hidden" });
    await setGymActive({ id: gym.id, isActive: false });

    const visible = await listGyms();
    const all = await listGyms({ includeInactive: true });
    expect(visible.some((g) => g.id === gym.id)).toBe(false);
    expect(all.some((g) => g.id === gym.id)).toBe(true);
  });
});

dbSuite("updateGym", () => {
  it("applies a patch and validates ranges", async () => {
    const gym = await createGym({ name: "test_gym Update" });

    const updated = await updateGym(gym.id, {
      address: "12 Gym Road",
      geoLat: 12.9,
      geoLng: 77.6,
      checkinRadiusM: 150,
      defaultMonthlyFeePaise: 150000,
      reminderDaysBefore: 5,
      wahaSessionName: "test_gym_update",
    });
    expect(updated.address).toBe("12 Gym Road");
    expect(updated.geoLat).toBe(12.9);
    expect(updated.checkinRadiusM).toBe(150);
    expect(updated.defaultMonthlyFeePaise).toBe(150000);
    expect(updated.reminderDaysBefore).toBe(5);

    await expect(
      updateGym(gym.id, { checkinRadiusM: 5 }),
    ).rejects.toThrow(/radius/);
    await expect(
      updateGym(gym.id, { reminderDaysBefore: 40 }),
    ).rejects.toThrow(/lead time/);
    await expect(
      updateGym(gym.id, { defaultMonthlyFeePaise: -1 }),
    ).rejects.toThrow(/paise/);
  });

  it("throws for an unknown gym", async () => {
    await expect(
      updateGym("00000000-0000-0000-0000-000000000000", { name: "test_gym X" }),
    ).rejects.toThrow(/no longer exists/);
  });
});
