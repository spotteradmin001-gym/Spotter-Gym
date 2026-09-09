# CR-1 … CR-10 — implementation decisions to review

Built across PRs #27–#52 following `SPOTTER_CR_PLAN.md`. Every locked decision
in `changes.md` was followed. The points below are places where the build had
to interpret a gap or make a call the spec did not pin down.

## Owner review outcome (2026-09-09)

Reviewed. Kept as-built: per-message pricing in paise; image-fetch failure →
text still sends, image `skipped`, not charged; JPEG/PNG/WebP + 5 MB + no
downscale; first reward-cron run scores one closed cycle, no backfill.

**Three changes requested — built as PRs #53+ (see "Post-review revisions"):**

1. **Streak reward auto-slides.** When the cycle-N+2 due is already paid in
   full (or absent), the reward applies to the member's **next unpaid due**
   instead of sitting as a manual pending credit.
2. **No schedule lock.** The per-cycle lock on closed-weekday / holiday edits
   is removed. Any change to a gym's weekly closed days or one-off holidays
   takes effect **immediately** and every affected member's calendar, current
   streak, and reward eligibility recompute from the current config —
   including for the current and past cycles. (Accepted tradeoff: an owner can
   retroactively change a finished cycle's rest-days and thereby revoke a
   reward a member believed was earned.)
3. **Owner picker on quote / bill send.** If a gym has more than one owner
   with a phone on file, the admin promotion page shows a dropdown to choose
   which owner the `wa.me` quote / bill link targets. One owner → no dropdown.

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

## Post-review revisions

- **R.1 — streak reward auto-slides.** PR #53. `applyDueStreakDiscounts` now
  applies a pending `earned` credit to the member's oldest `pending` due on or
  after `redeem_period` (slides forward when the redeem-period due is already
  settled or missing; stays `earned` and retries when no eligible due exists).
- **R.2 — no schedule lock.** Closed-weekday and holiday edits are allowed for
  any date; `scheduleLockBoundary` and its guards removed. Calendar / current
  streak / not-yet-scored reward cycles already read `closedDates(...)` live, so
  a schedule edit takes effect immediately. Already-written `earned` / `missed`
  reward rows are historical and not rewritten.
- **R.3 — owner picker on quote / bill send.** PR #55. `lib/promo-owner-contact.ts`
  (`maskPhone`, `ownerContactChoices`, `selectedOwnerPhone` — pure + tested) plus a
  client `OwnerContactPicker`. More than one owner with a phone → a `<select>`
  (email + masked phone) above the buttons, `wa.me` link rebuilt client-side from
  the choice; exactly one → no dropdown; zero → buttons disabled with a "No owner
  phone on file." note. Owner accounts have no name column, so the option label
  uses the account email.
- **R.4 — promo image: Neon `bytea` storage + delete-after-send.** PR #56.
  Migration `0018` (additive) adds `promotions.image_bytes` / `image_stored_at`
  / `image_deleted_at`; `image_drive_file_id` kept but no longer written. The
  Google Drive backend of `lib/promo-media.ts` is gone (JWT/Drive code, both
  env vars). `uploadPromoImage(promotionId, …)` / `fetchPromoImage` /
  `deletePromoImage` / `purgeStalePromoImages` all work on the row. The media
  route gains `DELETE`; the engine downloads a promotion's image once to
  `engine/.cache/`, base64s it per recipient, and `DELETE`s it (remote + local)
  when the promotion reaches a terminal status. The daily `plan-reminders` cron
  calls `purgeStalePromoImages()` as a backstop. Read queries in
  `db/queries/promotions.ts` use a shared `promotionColumns` projection that
  omits `image_bytes` — only `fetchPromoImage` ever selects the blob.
  Interpretation calls: (a) `createPromotionDraft` now takes `imageBytes` and
  delegates the write to `uploadPromoImage` (compose no longer uploads, it hands
  the bytes back); (b) the engine treats a 404 from the media route like a 503 —
  text-only, image `skipped`.

## Test infrastructure note (not a decision — a known nuisance)

The `db/**` vitest integration suites all target one shared Neon **preview**
branch. When CI runs and a local run overlap, fixture inserts occasionally hit
transient FK / unique violations. Every PR passed CI; a couple of post-merge
`main` runs flaked and were green on the automatic next push. A proper fix
(an ephemeral Neon branch per CI job, or a local Postgres container for the
`db/**` suites) is worth doing before real traffic — it is not in this CR set.
