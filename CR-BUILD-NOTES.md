# CR-1 … CR-10 — implementation decisions to review

Built across PRs #27–#52 following `SPOTTER_CR_PLAN.md`. Every locked decision
in `changes.md` was followed. The points below are places where the build had
to interpret a gap or make a call the spec did not pin down — review them and
say if any should change.

## CR-6 — credentials

- The scrypt hash in `users.password_hash` stays the only thing used to
  authenticate. The retrievable temp password lives in a separate
  `temp_credentials` table, AES-256-GCM encrypted, one row per user, deleted
  the moment the user changes their password.
- `CREDENTIAL_ENC_KEY` unset → "Show temp password" is disabled with a notice;
  "Reset password" still works (regenerates, shows once, stores nothing).
- Members are never offered a retrievable password (they use the activation
  token). Member detail gets **reset only**.

## CR-9 — streak reward

- **Only `pending` dues get the discount.** If the cycle-N+2 due was already
  paid in full before the reward evaluated, the reward stays `earned` (shown
  as a pending credit on the member and owner pages) and the owner settles it
  by hand. It is not auto-refunded.
- The first time the evaluation cron runs it scores the **one** most recently
  closed billing cycle. It does not backfill older history.
- A member who joined **after** a cycle started is skipped for that cycle
  (per changes.md decision 7 — reward-eligible from the first full cycle).
- `streak_reward_percent` captured on the reward row at evaluation time — a
  later change to the gym's percent does not rewrite existing rewards.
- Weekly closed-day edits in `/owner/settings` are **not** hard-locked (a
  weekly day always falls inside the current cycle, so locking it would make
  weekly config permanently uneditable); they apply from the next cycle. Only
  the one-off **holiday list** is hard-locked inside the current/past cycle —
  that is the actual gaming vector.
- `longest streak` on `/m` ignores the per-cycle allowed-misses buffer (the
  buffer is a reward concept, not a lifetime-best concept).

## CR-10 — promotions

- **`per_message_paise` is entered by the admin in whole paise**, not rupees
  (charges are sub-rupee, e.g. 30–50 paise; the admin is technical).
- Allowed promo image types: JPEG, PNG, WebP. GIF excluded (WhatsApp treats it
  as animation, unreliable as a photo). Max 5 MB, no server-side downscale
  (no image library was added).
- "Owner marks prepaid" sets `prepaid_paise = estimated_total_paise` and the
  status stays `approved`; the **admin** then flips it to `paid`. No extra
  column or status.
- Media-fetch failure at send time → the **image part** is marked `skipped`
  with a note and the **text part still sends**; the recipient is not marked
  failed for a missing image. (Resolves the open sub-question in changes.md.)
- WhatsApp-existence precheck runs only for **known-contact** recipients;
  members are assumed reachable (`wa_exists` left null).
- Auto-pause fires when a promotion has ≥ 10 send attempts in a run and
  ≥ 50 % of them failed — sets `paused_at` / `pause_reason`, flags the admin,
  the runner skips it until an admin clears it.
- The engine logs reminder sends into `waha_send_log` with `sent_on` = the
  database's UTC date (a small skew vs gym-local midnight, but consistent
  system-wide). Activation links are never engine-sent (share-link only per
  CR-7), so that `waha_send_log` kind stays unused — not a gap.
- Quote / bill "Send via WhatsApp" links target the first gym owner who has a
  phone number on file.
- New migration `0017` relaxes two CHECK constraints on the employee-permission
  tables so `promotion.create` is a valid permission / action type — the plan
  had said F.4 needed no migration; it did.

## Test infrastructure note (not a decision — a known nuisance)

The `db/**` vitest integration suites all target one shared Neon **preview**
branch. When CI runs and a local run overlap, fixture inserts occasionally hit
transient FK / unique violations. Every PR passed CI; a couple of post-merge
`main` runs flaked and were green on the automatic next push. A proper fix
(an ephemeral Neon branch per CI job, or a local Postgres container for the
`db/**` suites) is worth doing before real traffic — it is not in this CR set.
