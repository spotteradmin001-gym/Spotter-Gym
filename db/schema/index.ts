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
 *
 * Empty for now — Phase 1 Batch 1.1 adds `./auth`.
 */

export {};
