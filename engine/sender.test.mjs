import { describe, expect, it } from "vitest";

import { nextStatus, sendViaWaha, toChatId } from "./sender.mjs";

describe("toChatId", () => {
  it("strips non-digits and appends @c.us", () => {
    expect(toChatId("+91 75849 28285")).toBe("917584928285@c.us");
    expect(toChatId("917584928285")).toBe("917584928285@c.us");
  });
});

describe("nextStatus", () => {
  it("a successful send is 'sent'", () => {
    expect(nextStatus({ attempts: 0, ok: true, maxAttempts: 3 })).toEqual({
      status: "sent",
      attempts: 1,
    });
  });

  it("a failure stays 'pending' until maxAttempts, then 'failed'", () => {
    expect(nextStatus({ attempts: 0, ok: false, maxAttempts: 3 })).toEqual({
      status: "pending",
      attempts: 1,
    });
    expect(nextStatus({ attempts: 1, ok: false, maxAttempts: 3 })).toEqual({
      status: "pending",
      attempts: 2,
    });
    expect(nextStatus({ attempts: 2, ok: false, maxAttempts: 3 })).toEqual({
      status: "failed",
      attempts: 3,
    });
  });
});

describe("sendViaWaha", () => {
  const base = {
    wahaUrl: "http://waha.local/",
    apiKey: "k",
    session: "default",
    chatId: "917584928285@c.us",
    text: "hi",
  };

  it("routes to /api/sendText with the session and returns the message id", async () => {
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, body: JSON.parse(init.body), headers: init.headers };
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "wamid.123" }),
        text: async () => "",
      };
    };
    const r = await sendViaWaha({ ...base, fetchImpl });
    expect(seen.url).toBe("http://waha.local/api/sendText");
    expect(seen.body).toEqual({ session: "default", chatId: base.chatId, text: "hi" });
    expect(seen.headers["x-api-key"]).toBe("k");
    expect(r).toEqual({ ok: true, messageId: "wamid.123" });
  });

  it("a non-2xx response is a failure with the body", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 422,
      text: async () => "bad session",
      json: async () => ({}),
    });
    const r = await sendViaWaha({ ...base, fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("422");
    expect(r.error).toContain("bad session");
  });

  it("a thrown fetch is caught as a failure", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const r = await sendViaWaha({ ...base, fetchImpl });
    expect(r).toEqual({ ok: false, error: "ECONNREFUSED" });
  });
});
