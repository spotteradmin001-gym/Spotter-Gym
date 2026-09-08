# Pending changes / change requests

Post-Phase-7 change requests raised by the owner during go-live. Not yet
implemented.

## How this batch of work will run (owner, 2026-09-08)

- **Production cutover is paused.** The prod Vercel deploy exists and the
  Neon `main` branch is already migrated `0000`-`0012`, but go-live Steps 6-7
  (smoke test, reminder engine) are on hold and no more prod changes happen
  yet.
- The owner has **one more feature** to add to this list before build starts.
- Once the list is complete: write a proper **plan document** (architecture +
  phased batches, same style as `SPOTTER_BUILD_PLAN.md`) covering all the
  CRs, get it approved, then **execute against preview** batch by batch.
- Only after the whole CR set is built and verified on preview do we do a
  **single production cutover** (migrations + redeploy + smoke test + engine).
  No incremental per-PR production moves for this work.
- Each batch still: own branch, typecheck + lint + test + build + CI +
  preview deploy green before squash-merge to `main`.

---

## CR-1 — WAHA session name: set at gym creation, hide from the owner

**Raised:** 2026-09-08, during production go-live.

### Problem

`gyms.waha_session_name` is the string the local reminder engine
(`engine/send-reminders.mjs`) passes to WAHA `/api/sendText` to pick which
linked WhatsApp session sends this gym's reminders. It must match exactly the
name of a session that the operator (admin) has created and QR-linked in the
WAHA dashboard. A mismatch fails every reminder job for that gym (`failed`
status, "session not found").

Today the field is edited in `/owner/settings`. That puts the string in the
hands of the gym owner, who does not manage the WAHA container and can break
sending by changing it. The "link status" check on that settings page also
calls WAHA directly, which is laptop-only / not internet-reachable, so from
the deployed app it cannot verify the name anyway.

### Desired behaviour

- The WAHA session name is set when the **admin creates the gym** (add the
  field to the admin create-gym form). Sensible default if left blank — e.g.
  the gym slug.
- The admin can still change it later from the gym detail page
  (`/admin/gyms/[gymId]`).
- The gym owner **cannot edit** it. Preference: hide it from
  `/owner/settings` entirely. (Acceptable alternative: show it read-only so
  the owner knows which session is configured.)
- No schema change — the `waha_session_name` column already exists on `gyms`.

### Scope

UI + server-action only:
- `/admin/gyms` create-gym form + action: add the input, pass it to
  `createGym`.
- `/admin/gyms/[gymId]`: add an edit control for it (admin-only).
- `/owner/settings`: remove the input (or make it read-only text).
- `db/queries/gyms.ts`: `createGym` already accepts the field via `updateGym`;
  confirm the create path takes it. Default-to-slug logic if blank.
- Tests: admin can set/change it; owner settings no longer writes it.

### Open question for the owner

"Non-editable by admin or hide from admin" was said — read as **hide/lock from
the gym _owner_**; the **admin** keeps control (set at creation, editable on
gym detail). Confirm before implementing.

---

## CR-2 — "Fetch location" button for the gym geo fence

**Raised:** 2026-09-08, during production go-live.

### Problem

`/owner/settings` asks for `geo_lat` / `geo_lng` as raw numbers. Neither the
gym owner nor the admin knows the gym's coordinates off-hand. These feed the
location-locked QR check-in (haversine vs `checkin_radius_m`), so a wrong or
blank value breaks member check-in.

### Desired behaviour

A **"Use my current location"** button next to the lat/lng fields. Clicking it
calls the browser Geolocation API (`navigator.geolocation.getCurrentPosition`)
and fills both fields from the device's GPS. The person sets it while standing
at the gym (phone or laptop on-site).

- Requires HTTPS (production is HTTPS — fine) and a one-time browser
  permission prompt.
- Show the accuracy returned; warn if accuracy is poor (e.g. > 50 m).
- Keep the manual number inputs as a fallback / for fine-tuning.
- Optional later: a small map preview (pin + radius circle) so the person can
  see the fence. Needs a map tile source — defer unless wanted.
- Optional later: geocode the gym's postal address to coordinates. Needs a
  geocoding API (Google Maps / Nominatim / Mapbox) + key + usage terms —
  defer; the "use my location" button covers the common case with zero deps.

### Scope

Client component + no schema change:
- `/owner/settings` geo card: add the button, a client handler that calls
  `navigator.geolocation`, writes into the existing lat/lng inputs, shows
  accuracy / errors (permission denied, timeout, unavailable).
- Same control useful on the admin gym create / detail form if geo moves
  there.
- Tests: pure helper for the "accuracy too low" warning threshold; the
  geolocation call itself is browser-only (cover in the Playwright E2E if
  practical, otherwise manual).

### Accuracy note (device matters)

Phones have a GPS/GNSS chip → roughly 5-20 m outdoors. Most laptops/desktops
have no GPS and fall back to Wi-Fi or IP geolocation → 30 m to several km, and
a wired desktop with no Wi-Fi scan can be off by a whole city. Guidance to
surface in the UI: set the fence from a phone, on-site, standing at the gym
entrance outdoors or near a window, with **precise** (not approximate)
location permission granted. If the returned `coords.accuracy` is worse than
the threshold, block save and tell the person to go outside and retry.

---

## CR-3 — Responsive desktop + mobile views for the staff portals

**Raised:** 2026-09-08, during production go-live.

### Problem

The member app (`/m`, `/c/[gymSlug]`) is already mobile-first. The **admin**
(`/admin/*`) and **owner** (`/owner/*`) portals were built desktop-first
(wide tables, multi-column cards). Many owners and employees will open these
on a phone.

### Desired behaviour

- Every staff route usable on a phone: tables scroll or collapse to stacked
  rows, forms go single-column, nav collapses to a drawer/hamburger under a
  breakpoint, tap targets big enough.
- Desktop layout unchanged above the breakpoint.
- One responsive codebase — detect via CSS breakpoints (Tailwind `sm`/`md`/
  `lg`), not a separate "mobile site" or user-agent switch.

### Scope

CSS / layout only, no schema, no query changes. Do it portal by portal as its
own batch:
- Shared: `Table` primitive gets a mobile "card list" fallback; portal nav
  becomes a drawer under `md`.
- `/owner/*` pass — every page.
- `/admin/*` pass — every page.
- `/employee/*` pass.
- Check with the Playwright E2E at a mobile viewport, plus manual on a real
  phone.

---

## CR-4 — Activity log is admin-only

**Raised:** 2026-09-08, during production go-live.

### Problem

`/owner/audit` exposes the gym-scoped activity log to the gym owner. The owner
wants the audit log restricted to the platform **admin** only — no owner, no
employee, no member access.

### Desired behaviour

- `/admin/audit` stays (admin only, already guarded).
- `/owner/audit` is removed: drop the route (or make it `requireAdmin` /
  redirect), remove the nav link in the owner portal.
- Employees and members already have no audit route — confirm none is added
  and no audit data leaks into other pages.

### Scope

UI + guard only, no schema change (`audits` table and `writeAudit` stay —
still recording, just not shown to owners):
- Delete `app/(protected)/owner/audit/` (or lock it).
- Remove the owner-nav entry.
- Grep for `listAudits` / audit imports outside `/admin` and remove.
- Tests: owner hitting `/owner/audit` is redirected/404; admin still sees
  `/admin/audit`.

### Note

This also hides employee actions from the owner (approvals, payment edits,
etc.). Owner visibility into staff activity is handled separately by CR-5.

---

## CR-5 — Owner "staff activity" view (narrowed, not the raw audit log)

**Raised:** 2026-09-08, during production go-live. Depends on CR-4.

### Problem

CR-4 removes the owner's access to the raw audit log. Owners still have a
legitimate need to see what their own **employees** did — payments recorded,
members created/edited, expenses added, approval decisions.

### Desired behaviour

A dedicated `/owner/staff-activity` (name TBD) that shows **only**:

- actions performed by `employee`-role users **in this owner's gym**,
- business events only — payment recorded, member created/edited, expense
  added/edited, permission request filed / approved / rejected,
- columns: when, which employee, what action, which target (member / payment /
  expense), amount where relevant.

Explicitly **excludes**: admin actions, the owner's own actions, auth events,
session/security rows, anything from other gyms, raw JSON payloads.

### Scope

- New query, e.g. `listStaffActivity(gymId, { period })` — reads `audits`
  filtered to `actor_role = 'employee' AND gym_id = ?` and an allowlist of
  action types; never returns rows outside the gym.
- `/owner/staff-activity` page: period toggle, employee filter, plain table.
- Owner-nav entry.
- **No schema change** — `audits` already has `gym_id`, `actor_user_id`,
  `actor_role`, `action`, `target_type`, `target_id`, `meta`, `created_at`,
  plus an `audits_gym_created_idx` on `(gym_id, created_at)`. The new query is
  a filtered read over the existing table.
- Tests: no cross-gym rows, no admin/owner rows, only allowlisted action
  types, period filter correct.

### Open question for the owner

Should the owner also see their **own** actions in this view, or keep it
strictly "what my staff did"? Current assumption: staff only.

---

## CR-6 — Retrievable + resettable staff credentials

**Raised:** 2026-09-08, during production go-live.

### Current behaviour

`createOwnerForGym` / `createEmployee` generate a random password, store only
its scrypt hash, and show the plaintext **once** on the creation screen. If the
creator misses it, the only recovery today is the forgot-password email flow.
Members use a hashed 7-day activation token (no password set by staff) — that
part stays.

### Desired behaviour

1. **View the temp password later.** After creating an owner / employee, the
   creator (and the roles below) can re-open the record and see the temporary
   password again — but only until the account holder changes it
   (`must_change_password` flips to false), at which point it is gone forever.
2. **Reset password button.** Admin (for owners) / admin + owner (for
   employees and members) can force a reset: generate a fresh temp password,
   set `must_change_password = true`, revoke the account's sessions, and show
   the new temp password.
3. **Who can see what:**
   - Owner temp password → **admin only**.
   - Employee temp password → **admin + that gym's owner**.
   - Member — no password (token model); the reset button re-issues the
     activation link instead.

### Security tradeoff — decision needed

"View the temp password anytime" means the plaintext (or a reversibly
encrypted form) has to be stored until first login. That weakens the current
"hash only, never recoverable" posture — a DB leak would expose every
un-rotated temp password.

**Recommended compromise:**

- Keep scrypt hashing as the only thing used for authentication.
- Add a separate short-lived `temp_credential` store: the temp password
  **encrypted at rest** (AES-GCM, key from a new `CREDENTIAL_ENC_KEY` env
  var, never in the DB), row auto-deleted the moment `must_change_password`
  becomes false, and hard-capped to e.g. 14 days regardless.
- The **Reset** button is the primary recovery path and needs no storage — it
  just regenerates. "View again" is the convenience layer on top.
- Never store anything once the user has set their own password.

### Scope

- Migration: `temp_credentials` table (`user_id` FK cascade, `ciphertext`,
  `iv`, `created_at`) — additive.
- `lib/credential-crypto.ts` — AES-GCM encrypt/decrypt, key from env, pure +
  unit-tested.
- Queries: write on create / reset, read for the reveal, delete on
  `changeOwnPassword` / `resetPasswordWithToken` / any password set.
- `db/queries/users.ts` `+ resetUserPassword(actor, targetUserId)` with the
  role checks above; revoke sessions.
- UI: "Show temp password" + "Reset password" controls on
  `/admin/gyms/[gymId]` (owners) and `/owner/employees` + member detail
  (employees / members), gated by role.
- Audit every reveal and every reset (`writeAudit`).
- Tests: reveal blocked after first login; reset revokes sessions + forces
  change; owner cannot reveal another gym's employee; employee/member cannot
  reveal anything.

---

## CR-7 — "Share via WhatsApp" for credentials + activation links

**Raised:** 2026-09-08, during production go-live. Builds on CR-6.

### Decision (2026-09-08)

**No queued engine send.** Earlier draft had a second mechanism — a `pending`
job the local engine sends once the WAHA session connects. Dropped: the
"Share via WhatsApp" button covers the need with no backend, no table, no
engine change. The engine stays reminder-only.

### Idea

Right now owner/employee passwords are relayed by hand and member activation
links go by email only. Add a **"Share via WhatsApp"** button on the
create-account / reset-password / issue-activation-link screens:

- Client-side link: `https://wa.me/<E.164 digits>?text=<url-encoded message>`.
- Opens WhatsApp (app or web) with the recipient and the message pre-typed;
  the human presses Send from their own WhatsApp.
- Works immediately — no WAHA session, no engine, no server send.

### Security note

Sending a plaintext temp password over WhatsApp is the same exposure as
reading it over the phone — acceptable for a one-time, must-change credential,
but prefer putting the **activation / reset link** in the message rather than a
raw password wherever the flow allows it.

### Scope

- `lib/wa-link.ts` — build a `wa.me` URL from a phone + message, pure +
  tested (E.164 normalisation already in `lib/phone.ts`). Shared with CR-8.
- Message templates: owner welcome, employee welcome, member activation,
  password reset.
- UI: "Share via WhatsApp" button on the create/reset/activation screens,
  rendered only when a valid phone is on file.
- No schema, no engine change.
- Tests: link builder (phone normalisation, text encoding), button hidden
  without a phone.

---

## CR-8 — WhatsApp contact icon on people lists

**Raised:** 2026-09-08, during production go-live.

### Idea

A small WhatsApp icon next to each person in the staff-facing lists, linking
straight to a chat with them:

- Admin — beside each **gym owner** (on the gym detail page and any owners
  list).
- Owner / admin — beside each **employee** and each **member**.

Click → opens `https://wa.me/<their E.164 number>` (optionally with a prefilled
message) so the admin/owner can reach that person directly when needed.

### Scope

- Reuse `lib/wa-link.ts` from CR-7.
- Add the icon+link to: `/admin/gyms/[gymId]` owners table,
  `/owner/employees`, `/owner/members`, and the admin drill-in pages.
- Only render when a valid phone is on file; disabled/hidden otherwise.
- Pure, presentational — no backend, no schema. Can ship before CR-7's engine
  work.

### Overlap

CR-8 is the generic "contact this person" affordance; CR-7 is the same
`wa.me` technique aimed specifically at delivering a credential/link with the
message pre-filled. Build `lib/wa-link.ts` once, use in both.

---

## CR-9 — Member streak gamification + attendance reward

**Raised:** 2026-09-08, during production go-live. **Approved for build
2026-09-08.** The discount is opt-in: `streak_reward_percent` defaults to
**0**, which means the whole reward feature is off for that gym — no separate
enable flag. An owner who wants it sets a non-zero percent in
`/owner/settings`. So the feature can ship regardless of whether any given
owner adopts it.

### Goal

Make the member app motivating enough that members check in every gym day.
Reward consistent attendance with a fee discount the gym owner opts into.

### Parts

**9a — Post-check-in celebration**
- After a successful QR check-in, `/c/[gymSlug]` (and `/m`) shows a short
  celebratory animation + a motivational quote, like a game checkpoint.
- Quote pool: a bundled static list (write our own / use public-domain
  lines — no copyrighted quotes), rotate, avoid repeats within a week.
- Animation: keep it light and mobile-friendly — CSS/SVG first; a Lottie
  file only if it stays small. No blocking the check-in confirmation on it.
- Show the new streak count in the celebration.

**9b — Streak calendar**
- `/m` gets a month calendar: each gym-day marked checked-in / missed /
  upcoming, Sundays (and any owner-defined closed days) shown as rest days
  that neither require a check-in nor break the streak.
- Current streak + longest streak.

**9c — Rest-day-aware streak logic**
- `lib/streak.ts` today counts *consecutive calendar days*; a missed day
  breaks it. Change: a day the gym is **closed** (Sunday by default, plus
  owner holidays) is skipped — it does not require a check-in and does not
  break the streak. Only a missed **open** day breaks it.
- Needs the gym's closed-days config (see 9e).

**9d — Attendance reward (fee discount)**
- Owner-configurable in `/owner/settings`: enable/disable, discount percent
  (owner's example: 10%), allowed misses per cycle (buffer, 0 = strict).
- Qualifying rule: check in on every open day of the **billing cycle**, minus
  the allowed-misses buffer. All-or-nothing.
- **Redemption = cycle N+2.** A clean streak in billing cycle N discounts the
  payment for cycle **N+2**, never cycle N+1. Worked example (monthly member,
  pays at the start of each month): streak in month 1 → 10% off the **month 3**
  payment; streak in month 2 → 10% off the **month 4** payment; and so on.
- Each cycle is evaluated **independently** and the reward is **locked in once
  earned** — the member does not have to keep the streak going in later cycles
  to keep a reward already earned.
- Applied automatically to the cycle N+2 due (no per-member approval). Shown as
  a pending credit on the member's `/m/payments` and on `/owner/payments`.
- Treasure-chest UI on `/m`: locked all period, opens with an animation at
  period end if the member qualified, revealing the reward. If they broke the
  streak, show a "next period" reset state instead.

**9e — Gym schedule config (owner settings)**
- `/owner/settings` gets a **Holidays** section: weekly closed days (default
  Sunday, owner-editable) + a list of one-off holiday dates the owner adds.
- **Lock:** once a billing cycle has started, the owner cannot change closed
  days / holidays that fall inside the current (or a past) cycle — edits only
  apply to future cycles. Stops the reward being gamed by retroactively
  marking a missed day a holiday. Show the locked range in the UI.
- Feeds 9b, 9c, 9d.

### Schema (draft — refine at build)

- `gyms` + `closed_weekdays` (int[] or bitmask, default `[0]` = Sunday),
  `streak_reward_percent` default `0` (0 = feature off, no separate enable
  bool), `streak_allowed_misses` default `0`. Period is always the billing
  cycle; redemption is always cycle N+2 — no config for those.
- `gym_holidays` (gym_id, date, label).
- `streak_rewards` (id, member_id, gym_id, earned_period, redeem_period
  (= earned_period + 2), percent, status `earned|applied|missed`,
  applied_due_id ref, created_at) — the earned ledger, so a reward is granted
  once and visibly tied to the cycle N+2 due.
- Quotes: static file, no table.

### Decisions (owner, 2026-09-08)

1. **Reward period = the billing cycle** (~30 days), not the calendar month.
2. **Discount % is a single owner setting** (`/owner/settings`), applied
   automatically when earned — no per-member approval step. Owner still sees
   it on `/owner/payments`.
3. **All-or-nothing.** Miss one qualifying day → no reward that cycle.
4. **Reward is redeemed at cycle N+2.** Earned across cycle N; it does **not**
   discount cycle N+1's payment — it discounts cycle **N+2**'s payment
   (streak in month 1 → month 3's payment; month 2 → month 4's; etc.). Each
   cycle scored independently; once earned it is locked in regardless of later
   cycles.
5. **Streak buffer is an owner setting.** A per-gym "allowed misses per cycle"
   number the owner sets (0 = strict). Missing up to that many open days still
   keeps the streak / reward eligibility; the (N+1)th miss breaks it.

6. **Closed days = owner-configurable** in the `/owner/settings` Holidays
   section (weekly closed days, Sunday default, + one-off holidays), locked
   per cycle once the cycle starts (see 9e).

7. **No mid-cycle join case.** Each member's billing cycle starts on the day
   they are added to the gym, so a member is present for every day of every
   one of their own cycles — there is no partial first cycle to special-case.
   The streak reward is scored per that member's billing cycle.

8. **Anchor-day billing, not 30-day windows.** The cycle is calendar-month
   on the member's join day-of-month (e.g. 12th → 12th), which is exactly the
   app's current per-member anchor-day model. No billing change. Streak
   cycles use the same anchor-day boundaries, so "open days in the cycle"
   means the open days between one anchor date and the next (28-31 days).

### Still open

*(none — all CR-9 decisions resolved 2026-09-08)*

### Scope

Large — split into its own mini-phase (call it Phase 8), batched:
`9e schedule config` → `9c streak logic` → `9b calendar` → `9a celebration`
→ `9d reward + chest`. Each batch its own branch + PR + tests, per the build
discipline. Pure logic (`lib/streak.ts`, reward qualification, period maths)
gets unit tests; animations are manual / Playwright-smoke only.

---

## CR-10 — Promotions: paid bulk WhatsApp broadcast with admin approval

**Raised:** 2026-09-08, during production go-live.

### Flow the owner described

1. New **Promotions** tab. **Owner** always has it. An **employee** has it
   only with a new `promotion.create` permission (added to
   `EMPLOYEE_PERMISSIONS` in `lib/permissions.ts`).
   - If that permission is marked `requires_approval` for the employee, a
     submitted promotion first becomes a `permission_request` the **owner**
     approves (existing Phase 3.5 pattern, new `action_type`
     `promotion.create`) before it reaches admin.
   - Either way the **owner is always in the loop at the money step** —
     approving the estimate and prepaying is owner-only, an employee can
     never trigger a paid send.
2. **Build the recipient list** (two sources only):
   - **Members** — the gym's own members, shown grouped **active / inactive**;
     select all, a group, or individuals.
   - **Known contacts** — numbers the owner adds by hand or via the phone's
     contact picker; these are meant to be people the owner **already has in
     WhatsApp**, not cold numbers. A warning banner sits on this field:
     *"Only add numbers you already message on WhatsApp. Adding unknown
     numbers can get your gym's WhatsApp number banned."* The owner must tick
     a confirmation checkbox before submit.
   - **No free arbitrary broadcasting** — the added numbers still go through
     the checks below.
3. **Compose:** a promotional message (text) and optionally an **image**. On
   upload the image is stored in **our Google Drive** and the promotion keeps
   the Drive file id.
4. Owner presses **Send** → the promotion goes to **platform-admin (us)
   approval**, status `submitted`.
5. **Admin review** (`/admin/promotions`): read the message + image, see the
   **recipient count**, and enter a **per-contact charge** for that row →
   total = count × per-contact. Status `priced`.
6. **Quote the owner:** a "Send quote via WhatsApp" `wa.me` link beside the
   request (reuses `lib/wa-link.ts`) with the **estimated** amount + part
   count + recipient count pre-filled; admin clicks and sends.
7. Owner sees the priced promotion in `/owner/promotions`, **approves** the
   estimate → status `approved`.
8. **Owner prepays the estimate offline** (UPI / bank / cash). Admin marks it
   `paid`. Send does **not** start until `paid`.
9. Admin presses **Send** → status `sending`; the **local WAHA engine** on our
   desktop sends each part to every number **from that gym's WhatsApp
   session**, writing per-part status back. All parts resolved → `sent`
   (or `partly_failed` / `failed`).
10. **Reconcile:** once the send finishes, the app computes the real bill
    (delivered parts only, always ≤ the prepaid estimate). If parts failed,
    `refund_paise = prepaid − billed`; admin **refunds the difference
    offline** and marks it `refunded`. Exact match → `settled`.

### Is it possible? — yes, with caveats

All eight steps are buildable. The parts that need decisions or carry risk:

**Text and image are two separate billable messages. (DECIDED 2026-09-08)**
- A promotion can carry a **text part**, an **image part**, or **both**.
- Each part sent to a recipient is **one billable message**. Both parts →
  two charges for that recipient.
- The engine sends them as two WAHA calls (`/api/sendText` then
  `/api/sendImage`) and records a **status per part** per recipient.
- **Failure rules:**
  - image-only promotion, image send fails → that recipient is `failed`;
  - both parts, text ok + image fails → text `sent`, image `failed`
    (tracked separately, not a single recipient status);
  - text-only promotion, text fails → `failed`.
- **Billing: delivered parts only.** Final bill = `per_message_paise ×`
  (number of parts across all recipients with status `sent`). A `failed` or
  `skipped` part is never charged. The figure shown at approval is an
  estimate (`per_message_paise × parts × recipient_count`); the real bill is
  computed after the send finishes and can only be ≤ the estimate.

**A. Image storage — Google Drive, no links to WAHA. (DECIDED 2026-09-08)**
- App uploads the promo image to **Google Drive** via a Google **service
  account** (`GOOGLE_SERVICE_ACCOUNT_JSON` + `GDRIVE_PROMO_FOLDER_ID` env
  vars). Drive credentials stay **server-side only**.
- App exposes an internal endpoint `GET /api/promo-media/[promotionId]`,
  authed with a shared secret (same pattern as `CRON_SECRET`), that streams
  the image bytes back from Drive.
- The **engine** (runs on our desktop next to WAHA) fetches the bytes from
  that endpoint, **base64-encodes them locally**, and calls WAHA
  `/api/sendImage` with `file: { mimetype, data: <base64>, filename }`.
  WAHA never receives a URL — only raw bytes from our own local engine.
- **Fallback:** if the media fetch fails, the engine sends the message
  **text-only** via `/api/sendText`. (Decision: mark that recipient `sent`
  with a note, or `failed`?)
- Upload guards: max ~5 MB, optional server-side downscale, so the base64
  payload to WAHA stays reasonable.
- Not using Vercel Blob — owner wants Drive.

**B. "Numbers from his contacts" — DECIDED 2026-09-08.**
- Recipient sources are **members + known contacts only**, no arbitrary
  broadcast lists.
- The web has no reliable contacts API — Contact Picker is Chrome-on-Android
  only, nothing on desktop or iOS, and it cannot tell you which contacts are
  on WhatsApp. So the added-numbers input is: type / paste, plus Contact
  Picker where the device supports it. Normalise through `lib/phone.ts`,
  dedupe, drop any that match an existing member (already covered by the
  members source).
- **WhatsApp-existence precheck.** Before send, the engine checks each
  non-member number against WhatsApp via WAHA
  (`/api/{session}/contacts/check-exists`). Numbers **not on WhatsApp** →
  `skipped`, never charged. We cannot verify a number is in the *owner's*
  personal contacts — only that it is a real WhatsApp account — so the
  warning banner + confirmation checkbox carry the rest.
- Warning copy shown on the field and again on the submit confirm:
  *"Only add numbers you already message on WhatsApp. Unknown numbers can get
  your gym's WhatsApp banned."*

**C. Charging the owner. (DECIDED 2026-09-08)**
Fully **offline**, no payment provider. Sequence: admin prices → owner
approves the estimate → owner **prepays the estimate** (UPI / bank / cash) →
admin marks `paid` → send runs → app reconciles to delivered parts → admin
**refunds any overpayment offline** and marks `refunded`. The app only tracks
amounts and statuses; it moves no money.

**D2. Sending limits — DECIDED 2026-09-08.**
WhatsApp publishes no number for unofficial clients; bans are behaviour-based
(account age, volume spikes, block/report rate, messaging unsaved numbers,
identical bulk content). Working figures: a brand-new number ~20-40/day
(ramp up), a warmed number (weeks old, real 2-way chats, saved contacts)
~200/day, ~250 with care; 500+ is high risk. The official Business API's
lowest tier is 250 business-initiated/24h — we stay under that.

Per-gym, admin-configurable:
- `waha_daily_cap` — total sends/day for that gym number. Default **200**;
  set **40** for a fresh number.
- `transactional_reserve` — headroom held for reminders + activation.
  Default **60**.
- **Promo budget for a day = `waha_daily_cap − transactional_reserve −
  transactional sends already made today`.**
- A promotion larger than one day's promo budget: the engine sends what
  fits, leaves the promotion `sending`, and resumes on following days until
  every recipient is done.
- Randomised 5-12 s gap between promo sends; promo sends only within
  09:00-20:00 gym-local.
- The engine pauses a promotion if its failure rate spikes (early ban
  signal) and flags it for admin.
- Reminder + activation sends always take priority over promo sends and are
  never blocked by the promo budget (that is the point of the reserve).

Banner copy (owner, on the promo compose screen):
*"Your gym's WhatsApp number can safely send about 200 messages per day in
total. Payment reminders and new-member messages use part of that. Large
promotions are delivered over several days."*

**D. WhatsApp ban risk — ACCEPTED WITH GUARDRAILS 2026-09-08.**
Bulk promotional messages from a normal WhatsApp session — especially to
non-members who never opted in — is the exact behaviour WhatsApp bans numbers
for; WAHA is an unofficial client (against WhatsApp ToS for marketing); the
number at risk is the gym's own; India commercial-messaging / DND rules also
apply. The owner accepts this risk **on the condition that the guardrails
below are hard, non-optional parts of the feature** — "for the service to be
solid long-term". None of these are toggles the gym owner or an employee can
switch off:

1. Recipients limited to **members + owner-confirmed known contacts** only —
   no arbitrary lists, no CSV of cold numbers.
2. Mandatory warning banner + confirmation checkbox before submit.
3. Engine **WhatsApp-existence precheck** — non-registered numbers skipped,
   uncharged.
4. Per-gym **daily cap** (default 200) with a **transactional reserve**
   (default 60) that promos can never eat into.
5. Promotions **spread across days** when over budget — never a burst.
6. **Randomised 5-12 s** gap between sends; promo sends only 09:00-20:00
   gym-local.
7. Engine **auto-pauses** a promotion on a failure-rate spike and flags
   admin.
8. **Admin (us) approves every promotion** before any send — content and
   recipient list reviewed.
9. Every state change **audited**.
10. Owner **prepays**; failed parts **refunded** — no incentive to inflate
    lists.

If a future switch to the official WhatsApp Business API happens, the queue +
status model already fits it — only the engine's send call changes.

### Schema (draft)

```
promotions           id, gym_id, created_by (user_id),
                     body (null = no text part),
                     image_drive_file_id (null = no image part), image_mime,
                     has_text (bool), has_image (bool),   -- the parts
                     status ('draft'|'submitted'|'priced'|'approved'
                       |'paid'|'sending'|'sent'|'partly_failed'|'failed'
                       |'rejected'|'cancelled'),
                     settlement ('none'|'settled'|'refund_due'|'refunded'),
                     recipient_count,
                     per_message_paise (null until priced),
                     estimated_total_paise (null),   -- per_message × parts × recipients
                     prepaid_paise (null),           -- what the owner paid offline
                     billed_total_paise (null),      -- per_message × parts with status 'sent'
                     refund_paise (null),            -- prepaid − billed, refunded offline
                     admin_note (null),
                     submitted_at, priced_at, approved_at, paid_at,
                     sent_at, reconciled_at, created_at
promotion_recipients id, promotion_id, phone (E.164), member_id (null),
                     source ('member'|'contact'),
                     wa_exists (bool null until prechecked),
                     text_status ('pending'|'sent'|'failed'|'skipped'|'n/a'),
                     text_waha_id (null), text_error (null),
                     image_status ('pending'|'sent'|'failed'|'skipped'|'n/a'),
                     image_waha_id (null), image_error (null),
                     attempts, updated_at
```

Plus on `gyms`: `waha_daily_cap` (default 200), `transactional_reserve`
(default 60). A small `waha_send_log` (gym_id, sent_on date, kind
'reminder'|'activation'|'promo', count) or a daily rollup so the engine can
compute "transactional sends already made today" and the remaining promo
budget.

### Scope (its own mini-phase — proposed Phase 9)

- Migration: the two tables above.
- Google service-account integration (or Blob) + `lib/promo-media.ts`; app
  proxy route for WAHA media if Drive.
- `lib/wa-link.ts` (shared with CR-7/8) for the bill link.
- `lib/promo-cost.ts` — pure, tested: estimate (`per_message × parts ×
  recipients`) and final bill (`per_message × delivered parts`).
- Recipient builder: reuse `listMembers` (active/inactive groups);
  known-contacts input (type / paste / Contact Picker where supported),
  `lib/phone.ts` normalise + dedupe + drop member-matches; warning banner +
  confirm checkbox.
- Engine: WhatsApp-existence precheck for non-member numbers via WAHA
  `contacts/check-exists`; not-registered → `skipped`, uncharged.
- `lib/permissions.ts` + `promotion.create`; `permission_requests` dispatch
  + `action_type` `promotion.create`.
- `/owner/promotions` (list, compose, pick recipients, upload image, submit,
  approve employee submissions, approve estimate, mark prepaid-ack, status),
  `/employee/promotions` (permission-gated, compose + submit only),
  `/admin/promotions` (queue, review, price, reject, mark `paid`, send, mark
  `refunded`).
- Engine: `engine/send-promotions.mjs` (or extend the reminder runner) —
  reads `promotion_recipients` for `sending` promotions, WAHA
  `/api/sendText` + `/api/sendImage`/`sendFile`, per-recipient status, retry
  cap, send delay, per-session daily cap. Note: the engine currently only
  calls `/api/sendText` — media send is new.
- Audit every state change; `writeAudit`.
- Tests: cost maths, phone normalise/dedupe, state machine, engine status
  transitions with a mock WAHA, permission gates, no send before `approved`
  (and `paid` if we require it).

### Decisions needed

1. ~~Image store~~ — **DECIDED**: Google Drive, engine downloads bytes and
   base64-attaches to WAHA, no links sent.
2. ~~Text/image failure handling~~ — **DECIDED**: text and image are separate
   billable messages, status tracked per part, image-only failure → recipient
   `failed`. **Bill delivered parts only** — a `failed` part is not charged.
   The final bill = `per_message_paise × count of parts with status `sent``.
3. ~~Payment collection~~ — **DECIDED**: fully **offline**. No payment
   provider. Admin marks `paid` / `refunded` by hand.
4. ~~Pay gate~~ — **DECIDED**: owner **prepays the estimate**; send starts
   only at status `paid`; overpayment (failed parts) is **refunded offline**
   after reconciliation. Never a post-send top-up — the real bill is always
   ≤ the prepaid estimate.
5. ~~Recipient sources~~ — **DECIDED**: members + owner's known contacts
   only, no arbitrary lists; warning banner + confirm checkbox; engine
   WhatsApp-existence precheck skips non-WhatsApp numbers (uncharged).
6. ~~Daily send cap~~ — **DECIDED**: per-gym `waha_daily_cap` default 200
   (40 for a fresh number), `transactional_reserve` default 60, promo budget
   = cap − reserve − today's transactional sends, promotions span multiple
   days, 5-12 s randomised gap, 09:00-20:00 local, reminders/activation
   always priority. Banner tells the owner the ~200/day total.
7. ~~Who can create/submit~~ — **DECIDED**: owner always; employee with a
   new `promotion.create` permission (honours `requires_approval` → owner
   approves first). Estimate-approval + prepay stays owner-only.
8. ~~Accept the WhatsApp-ban / ToS / DND risk~~ — **ACCEPTED 2026-09-08**,
   conditional on the 10 hard guardrails in section D being non-optional
   (not owner/employee-toggleable).

### All CR-10 decisions resolved (2026-09-08). Ready to plan.
