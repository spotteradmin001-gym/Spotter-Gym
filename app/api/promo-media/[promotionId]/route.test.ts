import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/queries", () => ({ getPromotion: vi.fn() }));
vi.mock("@/lib/promo-media", () => ({
  isPromoMediaSecretSet: vi.fn(),
  isAuthorizedPromoMedia: vi.fn(),
  fetchPromoImage: vi.fn(),
  PromoMediaError: class PromoMediaError extends Error {},
}));

import { getPromotion } from "@/db/queries";
import {
  fetchPromoImage,
  isAuthorizedPromoMedia,
  isPromoMediaSecretSet,
} from "@/lib/promo-media";

import { GET } from "./route";

const mocked = {
  getPromotion: vi.mocked(getPromotion),
  isPromoMediaSecretSet: vi.mocked(isPromoMediaSecretSet),
  isAuthorizedPromoMedia: vi.mocked(isAuthorizedPromoMedia),
  fetchPromoImage: vi.mocked(fetchPromoImage),
};

function call(promotionId = "p1") {
  return GET(new Request(`https://x/api/promo-media/${promotionId}`), {
    params: Promise.resolve({ promotionId }),
  });
}

type Promo = NonNullable<Awaited<ReturnType<typeof getPromotion>>>;
const withImage = {
  id: "p1",
  imageDriveFileId: "drive-1",
  imageMime: "image/png",
} as unknown as Promo;

beforeEach(() => {
  mocked.isPromoMediaSecretSet.mockReturnValue(true);
  mocked.isAuthorizedPromoMedia.mockReturnValue(true);
  mocked.getPromotion.mockResolvedValue(withImage);
  mocked.fetchPromoImage.mockResolvedValue({
    bytes: Buffer.from([1, 2, 3]),
    mime: "image/png",
  });
});

afterEach(() => vi.clearAllMocks());

describe("GET /api/promo-media/[promotionId]", () => {
  it("503 when the shared secret is unset", async () => {
    mocked.isPromoMediaSecretSet.mockReturnValue(false);
    const res = await call();
    expect(res.status).toBe(503);
    expect(mocked.fetchPromoImage).not.toHaveBeenCalled();
  });

  it("401 when the bearer token is wrong or missing", async () => {
    mocked.isAuthorizedPromoMedia.mockReturnValue(false);
    expect((await call()).status).toBe(401);
  });

  it("404 for an unknown promotion or one with no image part", async () => {
    mocked.getPromotion.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);

    mocked.getPromotion.mockResolvedValueOnce({
      ...withImage,
      imageDriveFileId: null,
    } as unknown as Promo);
    expect((await call()).status).toBe(404);
  });

  it("200 streams the Drive bytes with the promotion's mime", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(mocked.fetchPromoImage).toHaveBeenCalledWith("drive-1");
  });

  it("502 when Drive fails", async () => {
    mocked.fetchPromoImage.mockRejectedValue(new Error("drive down"));
    expect((await call()).status).toBe(502);
  });
});
