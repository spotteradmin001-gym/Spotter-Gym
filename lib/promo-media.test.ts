import crypto from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetPromoMediaTokenCache,
  assertValidPromoImage,
  fetchPromoImage,
  isAuthorizedPromoMedia,
  isPromoMediaEnabled,
  isPromoMediaSecretSet,
  MAX_PROMO_IMAGE_BYTES,
  PromoMediaError,
  uploadPromoImage,
} from "./promo-media";

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const SA_JSON = JSON.stringify({
  client_email: "svc@example.iam.gserviceaccount.com",
  private_key: PEM.replace(/\n/g, "\\n"),
});

const ENV_KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "GDRIVE_PROMO_FOLDER_ID",
  "PROMO_MEDIA_SECRET",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  __resetPromoMediaTokenCache();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("configuration guards", () => {
  it("isPromoMediaEnabled needs both a service account and a folder id", () => {
    expect(isPromoMediaEnabled()).toBe(false);

    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SA_JSON;
    expect(isPromoMediaEnabled()).toBe(false); // no folder yet

    process.env.GDRIVE_PROMO_FOLDER_ID = "folder-1";
    expect(isPromoMediaEnabled()).toBe(true);
  });

  it("rejects a malformed service-account JSON", () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{not json";
    process.env.GDRIVE_PROMO_FOLDER_ID = "folder-1";
    expect(isPromoMediaEnabled()).toBe(false);

    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ foo: "bar" });
    expect(isPromoMediaEnabled()).toBe(false);
  });

  it("isPromoMediaSecretSet + isAuthorizedPromoMedia gate on the bearer secret", () => {
    const req = (auth?: string) =>
      new Request("https://x/api/promo-media/p1", {
        headers: auth ? { authorization: auth } : {},
      });

    expect(isPromoMediaSecretSet()).toBe(false);
    expect(isAuthorizedPromoMedia(req("Bearer whatever"))).toBe(false);

    process.env.PROMO_MEDIA_SECRET = "s3cr3t";
    expect(isPromoMediaSecretSet()).toBe(true);
    expect(isAuthorizedPromoMedia(req("Bearer s3cr3t"))).toBe(true);
    expect(isAuthorizedPromoMedia(req("Bearer wrong"))).toBe(false);
    expect(isAuthorizedPromoMedia(req())).toBe(false);
  });
});

describe("assertValidPromoImage", () => {
  const ok = new Uint8Array([1, 2, 3, 4]);

  it("accepts a small JPEG/PNG/WebP", () => {
    expect(() => assertValidPromoImage(ok, "image/jpeg")).not.toThrow();
    expect(() => assertValidPromoImage(ok, "IMAGE/PNG")).not.toThrow();
    expect(() => assertValidPromoImage(ok, "image/webp")).not.toThrow();
  });

  it("rejects a non-image mime, an empty file and an oversize file", () => {
    expect(() => assertValidPromoImage(ok, "application/pdf")).toThrow(
      PromoMediaError,
    );
    expect(() => assertValidPromoImage(ok, "image/gif")).toThrow(PromoMediaError);
    expect(() => assertValidPromoImage(new Uint8Array(0), "image/png")).toThrow(
      /empty/,
    );
    expect(() =>
      assertValidPromoImage(
        new Uint8Array(MAX_PROMO_IMAGE_BYTES + 1),
        "image/png",
      ),
    ).toThrow(/5 MB/);
  });
});

describe("uploadPromoImage", () => {
  it("throws when storage is not configured", async () => {
    await expect(uploadPromoImage(new Uint8Array([1]), "image/png")).rejects.toBeInstanceOf(
      PromoMediaError,
    );
  });

  it("exchanges a signed JWT for a token then multipart-uploads, returning the file id", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SA_JSON;
    process.env.GDRIVE_PROMO_FOLDER_ID = "folder-xyz";

    const seen: { tokenBody?: string; uploadAuth?: string; uploadType?: string } = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        if (u === "https://oauth2.googleapis.com/token") {
          seen.tokenBody = String(init?.body);
          return jsonResponse({ access_token: "tok-123", expires_in: 3600 });
        }
        if (u.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
          const headers = new Headers(init?.headers);
          seen.uploadAuth = headers.get("authorization") ?? undefined;
          seen.uploadType = headers.get("content-type") ?? undefined;
          return jsonResponse({ id: "drive-file-42" });
        }
        throw new Error(`unexpected fetch ${u}`);
      }),
    );

    const id = await uploadPromoImage(new Uint8Array([9, 8, 7]), "image/png");
    expect(id).toBe("drive-file-42");
    expect(seen.tokenBody).toContain("grant_type=urn");
    expect(seen.tokenBody).toContain("assertion=");
    expect(seen.uploadAuth).toBe("Bearer tok-123");
    expect(seen.uploadType).toMatch(/^multipart\/related; boundary=/);
  });

  it("surfaces a token-exchange failure as PromoMediaError", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SA_JSON;
    process.env.GDRIVE_PROMO_FOLDER_ID = "folder-xyz";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "invalid_grant" }, 400)),
    );
    await expect(
      uploadPromoImage(new Uint8Array([1, 2]), "image/jpeg"),
    ).rejects.toThrow(/service-account token/);
  });
});

describe("fetchPromoImage", () => {
  it("returns the bytes and normalised mime from Drive", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SA_JSON;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u === "https://oauth2.googleapis.com/token") {
          return jsonResponse({ access_token: "tok-abc", expires_in: 3600 });
        }
        if (u.startsWith("https://www.googleapis.com/drive/v3/files/")) {
          expect(u).toContain("file-99");
          expect(u).toContain("alt=media");
          return new Response(new Uint8Array([4, 5, 6]), {
            status: 200,
            headers: { "content-type": "image/jpeg; charset=binary" },
          });
        }
        throw new Error(`unexpected fetch ${u}`);
      }),
    );

    const { bytes, mime } = await fetchPromoImage("file-99");
    expect([...bytes]).toEqual([4, 5, 6]);
    expect(mime).toBe("image/jpeg");
  });

  it("throws PromoMediaError for a Drive error and when unconfigured", async () => {
    await expect(fetchPromoImage("x")).rejects.toBeInstanceOf(PromoMediaError);

    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SA_JSON;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("token")
          ? jsonResponse({ access_token: "t", expires_in: 3600 })
          : jsonResponse({ error: "notFound" }, 404),
      ),
    );
    await expect(fetchPromoImage("missing")).rejects.toThrow(/could not return/i);
  });
});
