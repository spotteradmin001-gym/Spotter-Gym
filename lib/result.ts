/**
 * The one shape every server action in Spotter returns.
 *
 * Actions never throw across the server/client boundary for expected failures
 * (validation, "not allowed", "already exists") — they return `err(...)` and the
 * form renders `result.error`. Only genuinely unexpected faults throw, and those
 * are caught by `app/error.tsx`.
 *
 * Shaped as a discriminated union on `ok` so `useActionState` consumers can
 * narrow with a single check. `null` is the pre-submit state.
 */
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type ActionState<T = void> = ActionResult<T> | null;

/** Success. Pass a payload for actions that return data to the caller. */
export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | void> {
  return { ok: true, data } as ActionResult<T | void>;
}

/** Expected failure. `message` is shown to the user verbatim, so keep it human. */
export function err(
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult<never> {
  return { ok: false, error: message, fieldErrors };
}

/**
 * Thrown by domain code for expected failures that are easier to raise than to
 * thread a return value back through. `toActionResult` turns it into `err(...)`;
 * anything that is not an `ActionError` is an unexpected fault and keeps
 * propagating to the error boundary.
 */
export class ActionError extends Error {
  readonly fieldErrors?: Record<string, string>;
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ActionError";
    this.fieldErrors = fieldErrors;
  }
}

const UNEXPECTED = "Something went wrong. Please try again.";

/**
 * Map a caught value to user-facing copy. `ActionError` carries its own message;
 * everything else collapses to a single generic line so internal details
 * (stack traces, driver errors, PII in a message) never reach the browser.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof ActionError) return error.message;
  return UNEXPECTED;
}

/**
 * `try`/`catch` wrapper for action bodies: run `fn`, return its `ActionResult`,
 * and convert a thrown `ActionError` into `err(...)`. Re-throws anything else.
 */
export async function toActionResult<T>(
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ActionError) {
      return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    }
    throw error;
  }
}
