import "server-only";

import crypto from "node:crypto";

/**
 * Promo-image storage for paid WhatsApp promotions (Phase F / CR-10).
 *
 * Images live in our own Google Drive, reached with a Google **service
 * account** — credentials never leave the server. The app uploads on compose
 * (`uploadPromoImage`) and the local WAHA engine reads the bytes back through
 * `GET /api/promo-media/[promotionId]` (which calls `fetchPromoImage`),
 * base64-encodes them locally and attaches them to WAHA. No Drive URL is ever
 * handed to WAHA.
 *
 * Zero new dependencies: the service-account JWT is assembled and RS256-signed
 * with Node's built-in `crypto`, and every Google call is a plain `fetch`.
 *
 * Graceful degradation (mirrors `lib/mail.ts`):
 *   - `GOOGLE_SERVICE_ACCOUNT_JSON` / `GDRIVE_PROMO_FOLDER_ID` unset →
 *     `isPromoMediaEnabled()` is false; the compose UI hides image upload and
 *     text-only promotions still work end to end.
 *   - `PROMO_MEDIA_SECRET` unset → the media route returns 503 and the engine
 *     sends text-only, marking the image part `skipped`.
 */

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";

/** Hard upload ceiling so the base64 payload the engine sends to WAHA stays sane. */
export const MAX_PROMO_IMAGE_BYTES = 5 * 1024 * 1024;

/** Image types WhatsApp renders reliably as a photo. */
export const ALLOWED_PROMO_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export class PromoMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromoMediaError";
  }
}

type ServiceAccount = { clientEmail: string; privateKey: string };

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      clientEmail: parsed.client_email,
      // Env vars flatten newlines; restore them for the PEM parser.
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

function promoFolderId(): string | null {
  return process.env.GDRIVE_PROMO_FOLDER_ID?.trim() || null;
}

/** True when image upload can work — a valid service account and a target folder. */
export function isPromoMediaEnabled(): boolean {
  return serviceAccount() !== null && promoFolderId() !== null;
}

/** True when the media route's shared secret is configured. */
export function isPromoMediaSecretSet(): boolean {
  return Boolean(process.env.PROMO_MEDIA_SECRET?.trim());
}

/**
 * Whether a request carries the correct `Authorization: Bearer <secret>` for
 * the media route. Returns false when the secret is unset — the route checks
 * `isPromoMediaSecretSet()` first and answers 503 in that case.
 */
export function isAuthorizedPromoMedia(request: Request): boolean {
  const secret = process.env.PROMO_MEDIA_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Validate a candidate promo image. Pure — no Drive call — so the compose
 * action and its tests can use it directly. Throws `PromoMediaError` with
 * user-facing copy.
 */
export function assertValidPromoImage(
  bytes: Uint8Array,
  mime: string,
): void {
  const normalised = mime.trim().toLowerCase();
  if (
    !(ALLOWED_PROMO_IMAGE_MIME as readonly string[]).includes(normalised)
  ) {
    throw new PromoMediaError(
      "The image must be a JPEG, PNG or WebP file.",
    );
  }
  if (bytes.byteLength === 0) {
    throw new PromoMediaError("That image file is empty.");
  }
  if (bytes.byteLength > MAX_PROMO_IMAGE_BYTES) {
    throw new PromoMediaError("The image must be 5 MB or smaller.");
  }
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

let tokenCache: { token: string; expiresAt: number } | undefined;

/** Reset the cached access token — test seam. */
export function __resetPromoMediaTokenCache(): void {
  tokenCache = undefined;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt - 60 > now) {
    return tokenCache.token;
  }

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: sa.clientEmail,
      scope: DRIVE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  let signature: Buffer;
  try {
    signature = crypto
      .createSign("RSA-SHA256")
      .update(signingInput)
      .sign(sa.privateKey);
  } catch {
    throw new PromoMediaError(
      "The Google service-account key is not a valid private key.",
    );
  }
  const assertion = `${signingInput}.${base64Url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new PromoMediaError(
      `Google rejected the service-account token request (${res.status}).`,
    );
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new PromoMediaError("Google returned no access token.");
  }
  tokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  };
  return json.access_token;
}

/**
 * Upload image bytes to the promo Drive folder. Returns the Drive file id to
 * store on the promotion. Validates type + size first.
 */
export async function uploadPromoImage(
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const sa = serviceAccount();
  const folderId = promoFolderId();
  if (!sa || !folderId) {
    throw new PromoMediaError("Image upload is not configured on this server.");
  }
  assertValidPromoImage(bytes, mime);

  const token = await accessToken(sa);
  const boundary = `spotter-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: `promo-${Date.now()}`,
    parents: [folderId],
    mimeType: mime,
  });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    ),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    throw new PromoMediaError(`Drive rejected the upload (${res.status}).`);
  }
  const json = (await res.json()) as { id?: string };
  if (!json.id) {
    throw new PromoMediaError("Drive upload returned no file id.");
  }
  return json.id;
}

export type PromoImageBytes = { bytes: Buffer; mime: string };

/** Download the bytes for a Drive file id. Used by the media route. */
export async function fetchPromoImage(
  fileId: string,
): Promise<PromoImageBytes> {
  const sa = serviceAccount();
  if (!sa) {
    throw new PromoMediaError("Image storage is not configured on this server.");
  }
  const token = await accessToken(sa);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      fileId,
    )}?alt=media`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new PromoMediaError(`Drive could not return that file (${res.status}).`);
  }
  const mime =
    res.headers.get("content-type")?.split(";")[0]?.trim() ||
    "application/octet-stream";
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, mime };
}
