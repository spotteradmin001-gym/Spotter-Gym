import { describe, expect, it } from "vitest";

import {
  ActionError,
  err,
  ok,
  toActionResult,
  toUserMessage,
  type ActionResult,
} from "@/lib/result";

describe("lib/result", () => {
  it("ok() with no payload is a success with no data", () => {
    expect(ok()).toEqual({ ok: true, data: undefined });
  });

  it("ok(data) carries the payload", () => {
    const result: ActionResult<{ id: number }> = ok({ id: 7 });
    expect(result).toEqual({ ok: true, data: { id: 7 } });
  });

  it("err() carries a human message and optional field errors", () => {
    expect(err("Email already in use", { email: "Taken" })).toEqual({
      ok: false,
      error: "Email already in use",
      fieldErrors: { email: "Taken" },
    });
  });

  describe("toUserMessage", () => {
    it("passes an ActionError message through", () => {
      expect(toUserMessage(new ActionError("Phone number is invalid"))).toBe(
        "Phone number is invalid",
      );
    });

    it("collapses any other error to a generic line", () => {
      expect(toUserMessage(new Error("column users.secret does not exist"))).toBe(
        "Something went wrong. Please try again.",
      );
      expect(toUserMessage("boom")).toBe(
        "Something went wrong. Please try again.",
      );
    });
  });

  describe("toActionResult", () => {
    it("returns the action's own result when nothing throws", async () => {
      const result = await toActionResult(async () => ok({ n: 1 }));
      expect(result).toEqual({ ok: true, data: { n: 1 } });
    });

    it("converts a thrown ActionError into err()", async () => {
      const result = await toActionResult(async () => {
        throw new ActionError("Not allowed", { role: "denied" });
      });
      expect(result).toEqual({
        ok: false,
        error: "Not allowed",
        fieldErrors: { role: "denied" },
      });
    });

    it("re-throws anything that is not an ActionError", async () => {
      await expect(
        toActionResult(async () => {
          throw new Error("unexpected");
        }),
      ).rejects.toThrow("unexpected");
    });
  });
});
