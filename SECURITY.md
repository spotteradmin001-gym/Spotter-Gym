# Security review

A manual pass over every trust boundary, done at the end of Phase 7. (The
`/security-review` skill needs the repo as the working directory; run it there
before the first production deploy for a second opinion.)

## Reviewed and OK

| Area | Notes |
|---|---|
| **Password storage** | scrypt (`crypto.scryptSync`), `saltHex:hashHex`, `timingSafeEqual` verify. No plaintext anywhere. |
| **Sessions** | Opaque id in an httpOnly + `secure` (prod) + `sameSite=lax` cookie, 30 days. `getSessionUser` re-checks expiry and `is_active` every request. Password change / reset / deactivate delete **all** the user's session rows. |
| **Login** | One generic `AuthError` for unknown email / wrong password / deactivated — no account enumeration. In-memory rate limit by `ip\|email`. |
| **Tenant isolation (IDOR)** | Every owner query takes `gymId` from `requireOwnerGym()` (session), never from the form. Employee via `requireEmployeeContext`, member via `requireMemberSelf`. Every scoped update/delete is `and(eq(id), eq(gymId))`. Admin drill-in asserts `user.gymId === gymId`. |
| **Server Actions** | Each mutating action calls a `require*` guard first — a Server Action is its own POST endpoint and is not trusted to have come from a gated page. |
| **Cron routes** | `isAuthorizedCron`: no `CRON_SECRET` in production ⇒ refuse; otherwise `Authorization: Bearer` compare. |
| **Password-reset token** | SHA-256 hash stored, raw only in the email, 1 h, single-use. |
| **Member activation token** | SHA-256 hash stored, 7 days, single-use; `activateMember` rejects an already-activated member and a taken email. |
| **Check-in QR token** | HMAC(`SESSION_SECRET`, `gymId:window`), 30 s ± 1, `timingSafeEqual`. Not forgeable without the secret. Replay is bounded by the window + same-day dedupe + the geo-fence. `/api/checkin` is rate-limited and requires a member session; `/api/checkin-qr` requires the owner of that exact gym. |
| **SQL injection** | All queries are parameterised through Drizzle. The few `sql\`\`` fragments interpolate column refs or server-derived dates, never request input. |
| **XSS** | React escaping only; no `dangerouslySetInnerHTML`. |
| **Open redirect** | `/login?next=` is accepted only when it is a same-origin relative path (`/…`, not `//…`), checked in both the page and the action. |
| **Mass assignment** | Actions read named fields from `FormData`; nothing is spread into a row. |
| **`writeAudit`** | Never throws — a failed audit is logged, not propagated. Append-only; no FK on `target_id` so the log outlives its target. |

## Residual risks (accepted for the pilot)

1. **Rate limiting is in-process** — per serverless instance, so a distributed
   attacker gets more than the nominal limit in total. Enough to stop casual
   brute force and retry storms. Upgrade: a `login_attempts` table or a KV
   store.
2. **`db/seed-admin.ts` ships a default password** (`Startup#2026`). The repo
   is private and the value is overridable via `SEED_ADMIN_PASSWORD`; change it
   in-app after the first sign-in.
3. **Unconfigured mailer logs secrets** — with `MAIL_HOST` unset, `sendMail`
   writes the reset link / temp password to the server console. Intended for
   dev; `HANDOFF.md` requires `MAIL_*` in production.
4. **Employees can read within their gym** — a section's *write* is
   permission-gated and its *list* now requires a matching permission too, but
   an employee with, say, `payment.record` can still read the member roster
   (needed to record a payment). Reads are gym-scoped; there is no cross-gym
   exposure.
5. **No CSRF token on Server Actions** — Next mitigates with the
   `sameSite=lax` session cookie and an Origin check on action POSTs; there is
   no extra token.
