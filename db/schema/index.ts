/**
 * The complete Spotter table inventory.
 *
 * Authoritative spec: SPOTTER_BUILD_PLAN.md §3. Schema is built up phase by
 * phase; each phase adds one file here and re-exports it below.
 *
 * Conventions (locked in Phase 1):
 *   - text primary keys generated with `gen_random_uuid()`
 *   - INR money as integer columns named *_paise, or numeric where fractions matter
 *   - created_at / updated_at as timestamptz default now()
 *   - every check constraint is explicitly named so tests can assert it by name
 */

export * from "./gyms";
export * from "./gym-holidays";
export * from "./auth";
export * from "./audits";
export * from "./config";
export * from "./members";
export * from "./checkins";
export * from "./dues";
export * from "./streak-rewards";
export * from "./reminders";
export * from "./payments";
export * from "./employees";
export * from "./expenses";
export * from "./temp-credentials";
