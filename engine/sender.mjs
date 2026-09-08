/**
 * Shared WAHA-call helpers for the local engine. No DB, no process env —
 * everything is injected so this is unit-testable. `send-reminders.mjs` and
 * `send-promotions.mjs` wire these to Neon + the laptop's WAHA.
 */

/** `+9198…` (or `9198…`) → `9198…@c.us`, the id WAHA's /api/sendText expects. */
export function toChatId(phone) {
  return `${String(phone).replace(/[^\d]/g, "")}@c.us`;
}

/**
 * Given the current attempt count and whether the send succeeded, decide the
 * job's next state. A failure keeps the job `pending` (a later run retries)
 * until it has been tried `maxAttempts` times, then it is `failed`.
 */
export function nextStatus({ attempts, ok, maxAttempts }) {
  const nextAttempts = attempts + 1;
  if (ok) return { status: "sent", attempts: nextAttempts };
  if (nextAttempts >= maxAttempts) {
    return { status: "failed", attempts: nextAttempts };
  }
  return { status: "pending", attempts: nextAttempts };
}

/**
 * One WAHA `/api/sendText` call. Returns `{ ok, messageId?, error? }` — never
 * throws (a thrown fetch becomes `{ ok: false, error }`).
 */
export async function sendViaWaha({
  wahaUrl,
  apiKey,
  session,
  chatId,
  text,
  fetchImpl = fetch,
}) {
  try {
    const res = await fetchImpl(`${wahaUrl.replace(/\/$/, "")}/api/sendText`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey ?? "",
      },
      body: JSON.stringify({ session, chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `WAHA ${res.status}: ${body.slice(0, 300)}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, messageId: data?.id ?? data?._data?.id?._serialized ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * WAHA WhatsApp-existence precheck (`GET /api/contacts/check-exists`). Used by
 * the promotions runner for `contact`-source recipients — a number that is not
 * a WhatsApp account is `skipped`, never charged. Never throws.
 */
export async function wahaCheckContactExists({
  wahaUrl,
  apiKey,
  session,
  phone,
  fetchImpl = fetch,
}) {
  try {
    const digits = String(phone).replace(/[^\d]/g, "");
    const url =
      `${wahaUrl.replace(/\/$/, "")}/api/contacts/check-exists` +
      `?phone=${digits}&session=${encodeURIComponent(session)}`;
    const res = await fetchImpl(url, { headers: { "x-api-key": apiKey ?? "" } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `WAHA ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, exists: Boolean(data?.numberExists) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * One WAHA `/api/sendImage` call with the raw bytes attached as base64 (WAHA
 * never sees a URL — the engine downloads from our own media endpoint first).
 * Returns `{ ok, messageId?, error? }`; never throws.
 */
export async function sendImageViaWaha({
  wahaUrl,
  apiKey,
  session,
  chatId,
  base64,
  mimetype,
  filename = "promo",
  caption,
  fetchImpl = fetch,
}) {
  try {
    const res = await fetchImpl(`${wahaUrl.replace(/\/$/, "")}/api/sendImage`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey ?? "",
      },
      body: JSON.stringify({
        session,
        chatId,
        file: { mimetype, data: base64, filename },
        ...(caption ? { caption } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `WAHA ${res.status}: ${body.slice(0, 300)}` };
    }
    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      messageId: data?.id ?? data?._data?.id?._serialized ?? null,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Download a promotion's image bytes from the app's media endpoint and return
 * them base64-encoded, ready for `sendImageViaWaha`. A 503 means the media
 * feature is not configured (`PROMO_MEDIA_SECRET` unset) — the caller then
 * sends text-only and marks the image part `skipped`. Never throws.
 */
export async function fetchPromoMedia({
  appUrl,
  secret,
  promotionId,
  fetchImpl = fetch,
}) {
  try {
    const res = await fetchImpl(
      `${appUrl.replace(/\/$/, "")}/api/promo-media/${promotionId}`,
      { headers: { authorization: `Bearer ${secret ?? ""}` } },
    );
    if (res.status === 503) return { ok: false, disabled: true, status: 503 };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        error: `media ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const header =
      (typeof res.headers?.get === "function" &&
        res.headers.get("content-type")) ||
      "image/jpeg";
    return {
      ok: true,
      base64: buf.toString("base64"),
      mimetype: header.split(";")[0].trim(),
      status: 200,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
