/**
 * Integration test for db/queries/config.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name `test_config %`.
 */
import { like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms } from "@/db/schema";
import {
  ConfigError,
  addProfileField,
  deleteProfileField,
  getTemplates,
  listProfileFields,
  updateProfileField,
  upsertTemplate,
} from "./config";
import { createGym } from "./gyms";

let gymId = "";
let otherGymId = "";

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_config Main" })).id;
    otherGymId = (await createGym({ name: "test_config Other" })).id;
  });
  afterAll(async () => {
    await db.delete(gyms).where(like(gyms.name, "test_config %"));
    await closeDb();
  });
}

dbSuite("member profile fields", () => {
  it("adds fields, orders them, and rejects a bad key or a duplicate", async () => {
    const a = await addProfileField({
      gymId,
      key: "blood_group",
      label: "Blood group",
      fieldType: "text",
    });
    const b = await addProfileField({
      gymId,
      key: "dob",
      label: "Date of birth",
      fieldType: "date",
      required: true,
    });
    expect(a.sortOrder).toBe(0);
    expect(b.sortOrder).toBe(1);

    await expect(
      addProfileField({ gymId, key: "Bad Key", label: "x", fieldType: "text" }),
    ).rejects.toBeInstanceOf(ConfigError);
    await expect(
      addProfileField({ gymId, key: "blood_group", label: "dup", fieldType: "text" }),
    ).rejects.toThrow(/already exists/);

    const list = await listProfileFields(gymId);
    expect(list.map((f) => f.key)).toEqual(["blood_group", "dob"]);
  });

  it("scopes update and delete to the owning gym", async () => {
    const [field] = await listProfileFields(gymId);
    // wrong gym → no-op, field still there
    await deleteProfileField(otherGymId, field!.id);
    expect((await listProfileFields(gymId)).some((f) => f.id === field!.id)).toBe(true);

    await updateProfileField(gymId, field!.id, { label: "Blood type", required: true });
    const after = (await listProfileFields(gymId)).find((f) => f.id === field!.id);
    expect(after?.label).toBe("Blood type");
    expect(after?.required).toBe(true);

    await deleteProfileField(gymId, field!.id);
    expect((await listProfileFields(gymId)).some((f) => f.id === field!.id)).toBe(false);
  });
});

dbSuite("reminder templates", () => {
  it("returns the shipped defaults until overridden, then the saved body", async () => {
    const before = await getTemplates(gymId);
    expect(before.pre_due).toContain("{{name}}");

    await upsertTemplate({ gymId, kind: "pre_due", body: "Custom {{name}} owes {{amount}}." });
    const after = await getTemplates(gymId);
    expect(after.pre_due).toBe("Custom {{name}} owes {{amount}}.");
    expect(after.on_due).toBe(before.on_due); // untouched

    // upsert again = update, not a duplicate
    await upsertTemplate({ gymId, kind: "pre_due", body: "Second {{name}} version here." });
    expect((await getTemplates(gymId)).pre_due).toBe("Second {{name}} version here.");
  });

  it("rejects a too-short body", async () => {
    await expect(
      upsertTemplate({ gymId, kind: "on_due", body: "hi" }),
    ).rejects.toThrow(/too short/);
  });
});
