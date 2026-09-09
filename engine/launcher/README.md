# Spotter Engine — desktop launcher (CR-12)

A double-clickable window for running the local send engine, instead of the
raw PowerShell command. It does exactly what `engine/start-engine.ps1` does —
`docker compose up -d`, wait for WAHA, then run `send-reminders.mjs` and
`send-promotions.mjs` on a timer — but shows Docker / WAHA / loop status and a
live log.

## First run

1. `engine/.env` must already be set up (see `engine/README.md`) — the launcher
   reads `WAHA_URL` / `WAHA_API_KEY` from it and the senders read `DATABASE_URL`
   etc. from it.
2. [Docker Desktop](https://www.docker.com/products/docker-desktop/) must be
   installed and running.
3. Node must be on `PATH` (`node -v` in a terminal).
4. Double-click **`Spotter-Engine.hta`**.

## Using it

- **Start loop** — brings up Docker + WAHA, then sends every N minutes
  (dropdown: 5 / 15 / 30 / 60). Minimise it; the loop keeps running.
- **Run once now** — a single send cycle, then stops.
- **Stop** — ends the loop.
- **Lights** — Docker up · WAHA reachable · loop running. Amber loop light =
  the next cycle is overdue (WAHA probably dropped — check the log).
- **Log** — the last 200 lines of `engine.log`. `reminders | … → sent`,
  `promotions | +9199 text → sent`, plus notices like
  `outside 09:00–20:00` (promotions only send in gym-local daytime) and
  `daily budget exhausted` (large promotion, resumes next day).

## Pin it

- **Taskbar / Start:** right-click `Spotter-Engine.hta` → *Show more options* →
  *Pin to Start*. For the taskbar, make a shortcut to it first
  (right-click → *Create shortcut*), then drag the shortcut to the taskbar.
- **Launch on login:** press `Win+R`, type `shell:startup`, Enter, and drop a
  shortcut to `Spotter-Engine.hta` in that folder. Add `--loop` behaviour by
  leaving the interval at 15 and pressing Start once after login, or wire a
  shortcut straight to the daemon:
  `node "…\engine\launcher\run-engine.mjs" --loop --every 15`.

## Files

| File | What |
|---|---|
| `Spotter-Engine.hta` | the GUI (Windows `mshta.exe`, no install) |
| `run-engine.mjs` | the daemon — also runnable directly: `node run-engine.mjs --once` |
| `launcher.mjs` | pure helpers (arg parse, cycle summary), unit-tested |
| `launcher.test.mjs` | tests, run by `npm test` |
| `make-icon.mjs` | regenerates `spotter-engine.ico` |
| `engine.log` / `status.json` | written at runtime, git-ignored |

Nothing here is deployed. The GUI is a convenience wrapper — the senders and
`start-engine.ps1` are unchanged and still work on their own.
