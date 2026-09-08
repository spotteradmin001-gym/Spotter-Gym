/**
 * Pure send-one logic for the local reminder sender. No DB, no process env —
 * everything is injected so this is unit-testable. `send-reminders.mjs` wires
 * it to Neon + the laptop's WAHA.
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
