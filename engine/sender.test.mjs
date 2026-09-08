import { describe, expect, it } from "vitest";

import {
  fetchPromoMedia,
  nextStatus,
  sendImageViaWaha,
  sendViaWaha,
  toChatId,
  wahaCheckContactExists,
} from "./sender.mjs";

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

describe("wahaCheckContactExists", () => {
  it("returns exists from numberExists and passes phone + session", async () => {
    let seenUrl;
    const fetchImpl = async (url) => {
      seenUrl = url;
      return { ok: true, status: 200, json: async () => ({ numberExists: true }), text: async () => "" };
    };
    const r = await wahaCheckContactExists({
      wahaUrl: "http://waha.local/",
      apiKey: "k",
      session: "gym-a",
      phone: "+91 75849 28285",
      fetchImpl,
    });
    expect(seenUrl).toContain("/api/contacts/check-exists?phone=917584928285");
    expect(seenUrl).toContain("session=gym-a");
    expect(r).toEqual({ ok: true, exists: true });
  });

  it("a non-2xx is a soft failure (caller retries, does not skip)", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom", json: async () => ({}) });
    const r = await wahaCheckContactExists({
      wahaUrl: "http://waha.local",
      apiKey: "k",
      session: "s",
      phone: "919",
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("500");
  });
});

describe("sendImageViaWaha", () => {
  it("posts base64 bytes to /api/sendImage as file.data (no URL)", async () => {
    let seen;
    const fetchImpl = async (url, init) => {
      seen = { url, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ id: "wamid.img" }), text: async () => "" };
    };
    const r = await sendImageViaWaha({
      wahaUrl: "http://waha.local",
      apiKey: "k",
      session: "s",
      chatId: "917584928285@c.us",
      base64: "AAECAw==",
      mimetype: "image/png",
      filename: "promo-1",
      fetchImpl,
    });
    expect(seen.url).toBe("http://waha.local/api/sendImage");
    expect(seen.body.file).toEqual({
      mimetype: "image/png",
      data: "AAECAw==",
      filename: "promo-1",
    });
    expect(JSON.stringify(seen.body)).not.toContain("http");
    expect(r).toEqual({ ok: true, messageId: "wamid.img" });
  });
});

describe("fetchPromoMedia", () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);

  it("returns base64 + mimetype on 200", async () => {
    const fetchImpl = async (url, init) => {
      expect(url).toBe("https://app.example/api/promo-media/p1");
      expect(init.headers.authorization).toBe("Bearer s3cr3t");
      return {
        ok: true,
        status: 200,
        headers: { get: () => "image/jpeg; charset=binary" },
        arrayBuffer: async () => bytes.buffer,
      };
    };
    const r = await fetchPromoMedia({
      appUrl: "https://app.example/",
      secret: "s3cr3t",
      promotionId: "p1",
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(r.mimetype).toBe("image/jpeg");
    expect(Buffer.from(r.base64, "base64")).toEqual(Buffer.from(bytes));
  });

  it("503 → disabled (engine sends text-only, image skipped)", async () => {
    const fetchImpl = async () => ({ ok: false, status: 503, text: async () => "" });
    const r = await fetchPromoMedia({
      appUrl: "https://app.example",
      secret: "",
      promotionId: "p1",
      fetchImpl,
    });
    expect(r).toEqual({ ok: false, disabled: true, status: 503 });
  });

  it("other errors surface with the status", async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, text: async () => "nope" });
    const r = await fetchPromoMedia({
      appUrl: "https://app.example",
      secret: "x",
      promotionId: "p1",
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });
});
