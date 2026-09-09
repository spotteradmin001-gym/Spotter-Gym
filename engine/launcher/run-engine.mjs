/**
 * Engine launcher daemon (CR-12). Wrapped by `Spotter Engine.hta`, but also
 * runnable on its own:
 *
 *   node engine/launcher/run-engine.mjs --once
 *   node engine/launcher/run-engine.mjs --loop --every 15
 *
 * Each cycle: `docker compose up -d` (first cycle only), wait for WAHA, then
 * run `send-reminders.mjs` + `send-promotions.mjs`, append their output to
 * engine/launcher/engine.log, and refresh engine/launcher/status.json so the
 * GUI can render Docker / WAHA / loop state without parsing the log.
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatLogLine,
  parseArgs,
  parseEnvFile,
  summariseCycle,
} from "./launcher.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const engineDir = join(here, "..");
const repoDir = join(engineDir, "..");
const stackDir = join(repoDir, ".."); // E:\whatsapp-gym-stack (docker-compose.yml)

const LOG_FILE = join(here, "engine.log");
const STATUS_FILE = join(here, "status.json");

const { mode, everyMinutes } = parseArgs(process.argv.slice(2));

const env = (() => {
  const file = join(engineDir, ".env");
  if (!existsSync(file)) return {};
  try {
    return parseEnvFile(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
})();
const WAHA_URL = process.env.WAHA_URL || env.WAHA_URL || "http://localhost:3000";
const WAHA_API_KEY = process.env.WAHA_API_KEY || env.WAHA_API_KEY || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let status = {
  pid: process.pid,
  mode,
  everyMinutes,
  startedAt: new Date().toISOString(),
  running: true,
  dockerUp: false,
  wahaUp: false,
  lastCycleAt: null,
  nextCycleAt: null,
  lastSummary: "starting…",
};

function writeStatus(patch) {
  status = { ...status, ...patch };
  try {
    writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch {
    /* ignore — the GUI falls back to the log */
  }
}

function log(message) {
  const line = formatLogLine(new Date(), message);
  try {
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log(line);
}

function dockerComposeUp() {
  log("docker compose up -d …");
  const res = spawnSync("docker", ["compose", "up", "-d"], {
    cwd: stackDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const ok = res.status === 0;
  if (ok) log("docker stack is up.");
  else log(`docker compose failed: ${(res.stderr || res.error?.message || "").trim().slice(0, 300)}`);
  writeStatus({ dockerUp: ok });
  return ok;
}

async function waitForWaha({ attempts = 45, gapMs = 2000 } = {}) {
  const url = `${WAHA_URL.replace(/\/$/, "")}/api/sessions`;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { headers: { "x-api-key": WAHA_API_KEY } });
      if (res.ok) {
        log("WAHA is reachable.");
        writeStatus({ wahaUp: true });
        return true;
      }
    } catch {
      /* not up yet */
    }
    await sleep(gapMs);
  }
  log(`WAHA did not answer at ${url} after ${attempts} tries.`);
  writeStatus({ wahaUp: false });
  return false;
}

function runSender(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(engineDir, file)], {
      cwd: repoDir,
      encoding: "utf8",
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    child.on("close", (code) => resolve({ code, out }));
    child.on("error", (err) => resolve({ code: -1, out: `${out}\n${err.message}` }));
  });
}

async function runCycle() {
  log("── cycle start ──");
  // A cheap WAHA re-check each cycle so the light is current.
  await waitForWaha({ attempts: 1, gapMs: 0 });

  const reminders = await runSender("send-reminders.mjs");
  for (const l of reminders.out.split(/\r?\n/).filter(Boolean)) log(`reminders | ${l}`);

  const promotions = await runSender("send-promotions.mjs");
  for (const l of promotions.out.split(/\r?\n/).filter(Boolean)) log(`promotions | ${l}`);

  const summary = summariseCycle({
    remindersOut: reminders.out,
    promotionsOut: promotions.out,
  });
  log(`── cycle done: ${summary.line} ──`);
  writeStatus({
    lastCycleAt: new Date().toISOString(),
    lastSummary: summary.line,
    nextCycleAt:
      mode === "loop"
        ? new Date(Date.now() + everyMinutes * 60_000).toISOString()
        : null,
  });
  return summary;
}

function shutdown(signal) {
  log(`received ${signal}; stopping.`);
  writeStatus({ running: false, nextCycleAt: null, lastSummary: "stopped" });
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

async function main() {
  // Fresh log per launch so the GUI pane starts clean.
  try {
    writeFileSync(LOG_FILE, "");
  } catch {
    /* ignore */
  }
  log(`launcher start — mode=${mode} every=${everyMinutes}min`);
  writeStatus({});

  dockerComposeUp();
  await waitForWaha();

  await runCycle();

  if (mode === "once") {
    writeStatus({ running: false, lastSummary: `${status.lastSummary} (once)` });
    log("single run complete.");
    process.exit(0);
  }

  const tick = async () => {
    if (!status.running) return;
    try {
      await runCycle();
    } catch (err) {
      log(`cycle error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  setInterval(tick, everyMinutes * 60_000);
  log(`looping every ${everyMinutes} min. Close this process (or the GUI's Stop) to end.`);
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.stack : String(err)}`);
  writeStatus({ running: false, lastSummary: "crashed" });
  process.exit(1);
});
