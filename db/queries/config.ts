import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { memberProfileFields, messageTemplates } from "@/db/schema";
import { DEFAULT_TEMPLATES, type TemplateKind } from "@/lib/template";

export { DEFAULT_TEMPLATES, renderTemplate, type TemplateKind } from "@/lib/template";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Member profile fields
// ─────────────────────────────────────────────────────────────────────────────

export type ProfileFieldType = "text" | "number" | "date";

export type ProfileField = {
  id: string;
  key: string;
  label: string;
  fieldType: ProfileFieldType;
  required: boolean;
  sortOrder: number;
};

function mapField(row: typeof memberProfileFields.$inferSelect): ProfileField {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    fieldType: row.fieldType as ProfileFieldType,
    required: row.required,
    sortOrder: row.sortOrder,
  };
}

const KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;

export async function listProfileFields(gymId: string): Promise<ProfileField[]> {
  const rows = await db
    .select()
    .from(memberProfileFields)
    .where(eq(memberProfileFields.gymId, gymId))
    .orderBy(asc(memberProfileFields.sortOrder), asc(memberProfileFields.label));
  return rows.map(mapField);
}

export async function addProfileField(input: {
  gymId: string;
  key: string;
  label: string;
  fieldType: ProfileFieldType;
  required?: boolean;
}): Promise<ProfileField> {
  const key = input.key.trim().toLowerCase();
  const label = input.label.trim();
  if (!KEY_RE.test(key)) {
    throw new ConfigError(
      "Key must be lowercase letters, digits and underscores, starting with a letter.",
    );
  }
  if (label.length < 2) throw new ConfigError("Enter a label.");
  if (!["text", "number", "date"].includes(input.fieldType)) {
    throw new ConfigError("Pick a valid field type.");
  }

  const [existing] = await db
    .select({ id: memberProfileFields.id })
    .from(memberProfileFields)
    .where(
      and(
        eq(memberProfileFields.gymId, input.gymId),
        eq(memberProfileFields.key, key),
      ),
    )
    .limit(1);
  if (existing) throw new ConfigError("A field with that key already exists.");

  const current = await listProfileFields(input.gymId);
  const [row] = await db
    .insert(memberProfileFields)
    .values({
      gymId: input.gymId,
      key,
      label,
      fieldType: input.fieldType,
      required: input.required ?? false,
      sortOrder: current.length,
    })
    .returning();
  return mapField(row!);
}

export async function updateProfileField(
  gymId: string,
  id: string,
  patch: Partial<{ label: string; required: boolean; sortOrder: number }>,
): Promise<void> {
  const set: Partial<typeof memberProfileFields.$inferInsert> = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (label.length < 2) throw new ConfigError("Enter a label.");
    set.label = label;
  }
  if (patch.required !== undefined) set.required = patch.required;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (Object.keys(set).length === 0) return;

  const rows = await db
    .update(memberProfileFields)
    .set(set)
    .where(
      and(eq(memberProfileFields.id, id), eq(memberProfileFields.gymId, gymId)),
    )
    .returning({ id: memberProfileFields.id });
  if (rows.length === 0) throw new ConfigError("That field no longer exists.");
}

/** Scoped to `gymId` so a stray id from another gym is a no-op. */
export async function deleteProfileField(
  gymId: string,
  id: string,
): Promise<void> {
  await db
    .delete(memberProfileFields)
    .where(
      and(eq(memberProfileFields.id, id), eq(memberProfileFields.gymId, gymId)),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reminder templates
// ─────────────────────────────────────────────────────────────────────────────

export async function getTemplates(
  gymId: string,
): Promise<Record<TemplateKind, string>> {
  const rows = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.gymId, gymId));

  const result: Record<TemplateKind, string> = { ...DEFAULT_TEMPLATES };
  for (const row of rows) {
    if (row.kind === "pre_due" || row.kind === "on_due") {
      result[row.kind] = row.body;
    }
  }
  return result;
}

export async function upsertTemplate(input: {
  gymId: string;
  kind: TemplateKind;
  body: string;
}): Promise<void> {
  const body = input.body.trim();
  if (body.length < 10) {
    throw new ConfigError("The message is too short.");
  }
  if (body.length > 1000) {
    throw new ConfigError("Keep the message under 1000 characters.");
  }

  await db
    .insert(messageTemplates)
    .values({ gymId: input.gymId, kind: input.kind, body })
    .onConflictDoUpdate({
      target: [messageTemplates.gymId, messageTemplates.kind],
      set: { body, updatedAt: new Date() },
    });
}
