/**
 * CR-13 repair: before the fix in lib/phone.ts, a 10-digit Indian mobile that
 * happened to start with 91 (e.g. 91234 56789) was taken to already carry the
 * country code and stored as `+91` + the remaining 8 digits (`+9123456789`).
 * A real Indian number in E.164 is `+91` + 10 digits, so an 11-character
 * `+91XXXXXXXX` can only be one of these. The repair puts the lost `91` back:
 * `+9123456789` → `+919123456789`.
 *
 * Pure — used by db/repair-91-phones.ts and unit-tested.
 */

const BROKEN = /^\+91(\d{8})$/;

/** The corrected number for a broken one, or null if `phone` isn't broken. */
export function repairPhone(phone: string | null | undefined): string | null {
  const m = BROKEN.exec(String(phone ?? "").trim());
  return m ? `+9191${m[1]}` : null;
}

/** `+919123456789` → `+91******6789` — enough to recognise, not to dial. */
export function maskPhone(phone: string): string {
  const s = String(phone);
  if (s.length <= 4) return s;
  const keepStart = s.startsWith("+") ? 3 : 0;
  return s.slice(0, keepStart) + "*".repeat(Math.max(0, s.length - keepStart - 4)) + s.slice(-4);
}

export type RepairRow = { id: string; scope: string; phone: string };
export type RepairChange = { id: string; scope: string; from: string; to: string };
export type RepairCollision = RepairChange & { reason: string };

/**
 * Plans the repairs for one table. `scope` is the column the phone must be
 * unique within (gym for members, promotion for recipients); `existing` holds
 * every `${scope}|${phone}` already stored in that table. A repair whose
 * corrected number is already taken in its scope — by another row, or by
 * another repair in this same run — is reported as a collision and left
 * alone, never overwritten.
 */
export function planRepairs(
  rows: RepairRow[],
  existing: Set<string>,
): { changes: RepairChange[]; collisions: RepairCollision[] } {
  const changes: RepairChange[] = [];
  const collisions: RepairCollision[] = [];
  const claimed = new Set<string>();

  for (const row of rows) {
    const to = repairPhone(row.phone);
    if (!to) continue;
    const key = `${row.scope}|${to}`;
    const change = { id: row.id, scope: row.scope, from: row.phone, to };
    if (existing.has(key)) {
      collisions.push({ ...change, reason: "the corrected number is already saved in this scope" });
    } else if (claimed.has(key)) {
      collisions.push({ ...change, reason: "another broken row repairs to the same number" });
    } else {
      claimed.add(key);
      changes.push(change);
    }
  }
  return { changes, collisions };
}
