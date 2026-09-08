# What's built

Phases 0–7 of `SPOTTER_BUILD_PLAN.md` — 25 PRs (#1–#25), all squash-merged to
`main`, each green on typecheck + lint + `npm test` + build + CI `verify` + a
Vercel preview deploy. **142 tests.** Migrations `0000`–`0012` applied to the
Neon **preview** branch (production migration is step 2 of `DEPLOY.md`).

## Auth (Phase 1)

- scrypt password hashing (`src/features/auth/password.ts`)
- DB-backed sessions — opaque id in an httpOnly + `secure` (prod) +
  `sameSite=lax` cookie, 30 days; deleting the row revokes instantly
- `/login` (generic error, `ip\|email` rate limit), `/logout`,
  `must_change_password` interceptor, `/change-password`
- forgot-password: `/forgot-password` + `/reset-password/[token]`
  (hashed token, 1 h, single-use, generic response)
- guards: `requireAdmin/Owner/Employee/Member`, `requireGymScope`,
  `requireUserForAction`, `requireOwnerGym`, `requireEmployeePermission`,
  `requireMemberSelf` / `requireCompleteProfile`
- **no 2FA** (owner decision)

## Admin (Phase 2)

- `/admin/gyms` — list, create, activate/deactivate
- `/admin/gyms/[gymId]` — counts, owners, create owner login (one-time pw),
  per-owner activate/deactivate
- `/admin/gyms/[gymId]/users/[userId]` — read-only drill-in, scoped by gym
- `/admin/audit` — full audit log
- `db/seed-admin.ts`

## Owner portal (Phase 3)

| Route | |
|---|---|
| `/owner` | Overview: this-month net, yet-to-receive, due-today, member stats (active, joins, **not renewed**), reminder counters |
| `/owner/members` | List (search + status), add, detail (edit, fee override, status, profile, dues, payments, check-ins, reminders, activation link) |
| `/owner/payments` | Record, period toggle, collected / outstanding / due-today, CSV export (`/owner/payments/export`) |
| `/owner/expenses` | Categories, recurring (salary link) + materialise, ad-hoc, period totals |
| `/owner/pnl` | Per-month income / expense / net, period toggle |
| `/owner/employees` | Add (one-time pw), per-permission checkboxes + "needs approval" toggle, activate/deactivate |
| `/owner/approvals` | Pending employee actions — Approve (writes now) / Reject |
| `/owner/reminders` | Job log + status filter + counters + Re-queue |
| `/owner/checkin-qr` | Auto-refreshing check-in QR |
| `/owner/audit` | Gym-scoped activity log |
| `/owner/settings` | Gym + geo fence + billing anchor + reminder lead time + WAHA session; reminder templates (live preview); member profile-field builder |

Dues generation (daily cron + manual), payment reconciliation (partial keeps
pending, overpay rolls forward), no proration.

## Employee portal (Phase 4)

- `/employee` — nav + pages built from the granted permission set
- members (read needs a member perm; add / edit gated), payments, expenses
- approval-gated permissions file a `permission_request` instead of writing;
  the owner's Approve runs the real write

## Member app (Phase 5)

- `/activate/[token]` — set email + password → member-role login + session
- `/m` — mobile shell, `requireCompleteProfile` gate → `/m/profile`
- `/m` home — streak + recent check-ins; `/m/payments` — dues + history + next due
- `/c/[gymSlug]` — location-locked QR check-in: rotating HMAC token
  (`SESSION_SECRET`, 30 s ± 1), browser geolocation, haversine vs the gym
  fence, same-day dedupe, streak

## WhatsApp reminders (Phase 6)

- **Planner** (in-app, `/api/cron/plan-reminders` daily): a `pre_due` job at
  `due_date − reminder_days_before` and an `on_due` job at `due_date` per
  pending due, message rendered from the gym's templates; not-sendable →
  `skipped`
- **Sender** (`engine/`, local, not deployed): reads `reminder_jobs` from
  Neon, sends via the laptop's WAHA `/api/sendText`, writes status back;
  retry cap, send delay, catch-up. `engine/start-engine.ps1` launcher.
- Dashboard only ever reads `reminder_jobs` — moving the sender to hosting
  later needs no dashboard change

## Hardening (Phase 7)

- `audits` table + `writeAudit` (never throws), wired into the
  security-relevant admin/owner mutations
- rate limit on `/api/checkin`
- `SECURITY.md` — trust-boundary review + residual risks
- `db/seed-dev.ts` — one full demo gym
- `README.md`, `HANDOFF.md`, `DEPLOY.md`
- Playwright: `e2e/roles.spec.ts` (`npm run test:e2e`, local-only)

## Not done

- Production database + env (`DEPLOY.md`).
- Cable-operator product (`SESSION_NOTES.md` — a separate future product).
- Deferred by the plan: always-on hosting for the sender; audit-log UI beyond
  the two list pages; a durable (non-in-process) rate limiter.
