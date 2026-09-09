import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/promo-media", () => ({
  isPromoMediaSecretSet: vi.fn(),
  isAuthorizedPromoMedia: vi.fn(),
  fetchPromoImage: vi.fn(),
  deletePromoImage: vi.fn(),
}));

import {
  deletePromoImage,
  fetchPromoImage,
  isAuthorizedPromoMedia,
  isPromoMediaSecretSet,
} from "@/lib/promo-media";

import { DELETE, GET } from "./route";

const mocked = {
  isPromoMediaSecretSet: vi.mocked(isPromoMediaSecretSet),
  isAuthorizedPromoMedia: vi.mocked(isAuthorizedPromoMedia),
  fetchPromoImage: vi.mocked(fetchPromoImage),
  deletePromoImage: vi.mocked(deletePromoImage),
};

function req(method: "GET" | "DELETE", promotionId = "p1") {
  return [
    new Request(`https://x/api/promo-media/${promotionId}`, { method }),
    { params: Promise.resolve({ promotionId }) },
  ] as const;
}

beforeEach(() => {
  mocked.isPromoMediaSecretSet.mockReturnValue(true);
  mocked.isAuthorizedPromoMedia.mockReturnValue(true);
  mocked.fetchPromoImage.mockResolvedValue({
    bytes: Buffer.from([1, 2, 3]),
    mime: "image/png",
  });
  mocked.deletePromoImage.mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe("GET /api/promo-media/[promotionId]", () => {
  it("503 when the shared secret is unset", async () => {
    mocked.isPromoMediaSecretSet.mockReturnValue(false);
    const res = await GET(...req("GET"));
    expect(res.status).toBe(503);
    expect(mocked.fetchPromoImage).not.toHaveBeenCalled();
  });

  it("401 when the bearer token is wrong or missing", async () => {
    mocked.isAuthorizedPromoMedia.mockReturnValue(false);
    expect((await GET(...req("GET"))).status).toBe(401);
  });

  it("404 when there is no stored image", async () => {
    mocked.fetchPromoImage.mockResolvedValueOnce(null);
    expect((await GET(...req("GET"))).status).toBe(404);
  });

  it("200 streams the bytes with the stored mime and no-store", async () => {
    const res = await GET(...req("GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(mocked.fetchPromoImage).toHaveBeenCalledWith("p1");
  });
});

describe("DELETE /api/promo-media/[promotionId]", () => {
  it("503 when the shared secret is unset", async () => {
    mocked.isPromoMediaSecretSet.mockReturnValue(false);
    expect((await DELETE(...req("DELETE"))).status).toBe(503);
    expect(mocked.deletePromoImage).not.toHaveBeenCalled();
  });

  it("401 when the bearer token is wrong or missing", async () => {
    mocked.isAuthorizedPromoMedia.mockReturnValue(false);
    expect((await DELETE(...req("DELETE"))).status).toBe(401);
    expect(mocked.deletePromoImage).not.toHaveBeenCalled();
  });

  it("204 and drops the image", async () => {
    const res = await DELETE(...req("DELETE"));
    expect(res.status).toBe(204);
    expect(mocked.deletePromoImage).toHaveBeenCalledWith("p1");
  });
});
