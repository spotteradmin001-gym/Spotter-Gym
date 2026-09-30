/**
 * CR-13 one-off repair: puts the lost `91` back on mobiles saved as `+91` + 8
 * digits before the lib/phone.ts fix (see lib/phone-repair.ts).
 *
 * Tables: `members.phone` (unique per gym) and `promotion_recipients.phone`
 * (unique per promotion) — the only columns filled by normalizePhone. User and
 * employee phones are stored as typed, so they never had this bug.
 *
 *   npm run db:repair-phones                                  dry run: prints what would change
 *   npm run db:repair-phones -- --apply --expect-host ep-xxx  writes, in one transaction
 *
 * Dry run is the default. `--apply` also needs `--expect-host` naming the
 * database endpoint it prints first, so a write can't land on the wrong
 * database by accident. A corrected number that is already taken in the same
 * gym / promotion is reported as a collision and left for a person to sort
 * out, never overwritten. Numbers are masked in the output.
 */
import "./load-env";

import pg from "pg";

import { maskPhone, planRepairs, type RepairChange, type RepairCollision } from "../lib/phone-repair";
import { getDatabaseUrl } from "./env";

const TABLES = [
  { table: "members", scope: "gym_id", label: "members (per gym)" },
  { table: "promotion_recipients", scope: "promotion_id", label: "promotion recipients (per promotion)" },
] as const;

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const url = getDatabaseUrl();
  const host = new URL(url).hostname;
  console.log(`Database host: ${host}`);
  console.log(apply ? "Mode: APPLY (writes)" : "Mode: dry run (no writes). Add --apply --expect-host <host> to write.");

  if (apply) {
    const expected = argValue("--expect-host");
    if (!expected || !host.startsWith(expected)) {
      throw new Error(`--apply needs --expect-host matching this database (${host}). Nothing written.`);
    }
  }

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const plans: { label: string; table: string; changes: RepairChange[]; collisions: RepairCollision[] }[] = [];

    for (const t of TABLES) {
      const broken = await client.query<{ id: string; scope: string; phone: string }>(
        `select id, ${t.scope} as scope, phone from ${t.table} where phone ~ '^\\s*\\+91[0-9]{8}\\s*$' order by ${t.scope}, id`,
      );
      const scopes = [...new Set(broken.rows.map((r) => r.scope))];
      const taken = scopes.length
        ? await client.query<{ scope: string; phone: string }>(
            `select ${t.scope} as scope, phone from ${t.table} where ${t.scope} = any($1::text[])`,
            [scopes],
          )
        : { rows: [] };
      const existing = new Set(taken.rows.map((r) => `${r.scope}|${r.phone.trim()}`));
      const plan = planRepairs(broken.rows, existing);
      plans.push({ label: t.label, table: t.table, ...plan });

      console.log(`\n${t.label}: ${plan.changes.length} to repair, ${plan.collisions.length} collision(s)`);
      for (const c of plan.changes) console.log(`  ${t.table} ${c.id}: ${maskPhone(c.from)} -> ${maskPhone(c.to)}`);
      for (const c of plan.collisions) {
        console.log(`  COLLISION ${t.table} ${c.id}: ${maskPhone(c.from)} -> ${maskPhone(c.to)} (${c.reason})`);
      }

      if (apply) {
        for (const c of plan.changes) {
          await client.query(`update ${t.table} set phone = $2, updated_at = now() where id = $1 and phone = $3`, [
            c.id,
            c.to,
            c.from,
          ]);
        }
      }
    }

    const total = plans.reduce((s, p) => s + p.changes.length, 0);
    const clashes = plans.reduce((s, p) => s + p.collisions.length, 0);
    if (apply) {
      await client.query("commit");
      console.log(`\nApplied: ${total} number(s) repaired. ${clashes} collision(s) left unchanged.`);
    } else {
      await client.query("rollback");
      console.log(`\nDry run: ${total} number(s) would be repaired, ${clashes} collision(s). Nothing written.`);
    }
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
