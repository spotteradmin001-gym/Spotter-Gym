/**
 * Integration test for db/queries/member-app.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name
 * `test_ma %`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms, memberActivationTokens, members, users } from "@/db/schema";
import { AuthError, getSessionUser } from "./auth";
import { addProfileField } from "./config";
import { createGym } from "./gyms";
import {
  activateMember,
  createMemberActivationToken,
  peekActivationToken,
  profileComplete,
} from "./member-app";
import { createMember, getMemberByUserId } from "./members";

describe("profileComplete (pure)", () => {
  const fields = [
    { id: "1", key: "blood", label: "Blood", fieldType: "text" as const, required: true, sortOrder: 0 },
    { id: "2", key: "notes", label: "Notes", fieldType: "text" as const, required: false, sortOrder: 1 },
  ];
  it("passes only when every required field is filled", () => {
    expect(profileComplete({}, fields)).toBe(false);
    expect(profileComplete({ blood: " " }, fields)).toBe(false);
    expect(profileComplete({ blood: "O+" }, fields)).toBe(true);
    expect(profileComplete({}, [])).toBe(true);
  });
});

let gymId = "";

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_ma Gym" })).id;
    await addProfileField({ gymId, key: "blood_group", label: "Blood group", fieldType: "text", required: true });
  });
  afterAll(async () => {
    const ids = (
      await db.select({ id: members.id }).from(members).where(eq(members.gymId, gymId))
    ).map((r) => r.id);
    for (const id of ids) {
      await db.delete(memberActivationTokens).where(eq(memberActivationTokens.memberId, id));
    }
    await db.delete(members).where(like(members.name, "test_ma %"));
    await db.delete(users).where(like(users.email, "test_ma_%"));
    await db.delete(gyms).where(like(gyms.name, "test_ma %"));
    await closeDb();
  });
}

dbSuite("activation", () => {
  it("issues, peeks, and consumes a token; the member gets a member-role login + session", async () => {
    const m = await createMember({
      gymId,
      name: "test_ma Anita",
      phone: "9500000001",
      joinDate: "2026-09-01",
    });

    const { token } = await createMemberActivationToken(gymId, m.id);
    const peek = await peekActivationToken(token);
    expect(peek?.memberName).toBe("test_ma Anita");

    const { userId, sessionId } = await activateMember(token, {
      email: "test_ma_anita@example.com",
      password: "member-pw-12345",
    });

    const sessionUser = await getSessionUser(sessionId);
    expect(sessionUser?.id).toBe(userId);
    expect(sessionUser?.role).toBe("member");

    const linked = await getMemberByUserId(userId);
    expect(linked?.id).toBe(m.id);
    expect(linked?.email).toBe("test_ma_anita@example.com");

    // token is now spent
    await expect(
      activateMember(token, { email: "x@example.com", password: "another-pw-12" }),
    ).rejects.toThrow(/invalid or has expired/);
  });

  it("refuses a member that already has a login, and a weak password", async () => {
    const m = await createMember({
      gymId,
      name: "test_ma Bo",
      phone: "9500000002",
      joinDate: "2026-09-01",
    });
    const { token } = await createMemberActivationToken(gymId, m.id);
    await expect(
      activateMember(token, { email: "test_ma_bo@example.com", password: "short" }),
    ).rejects.toBeInstanceOf(AuthError);

    await activateMember(token, {
      email: "test_ma_bo@example.com",
      password: "good-enough-pw",
    });
    await expect(createMemberActivationToken(gymId, m.id)).rejects.toThrow(
      /already has a login/,
    );
  });
});
