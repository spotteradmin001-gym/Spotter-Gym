/**
 * Tiny className joiner. Filters out falsy values so callers can write
 * `cn("base", condition && "extra", props.className)` without a dependency
 * on `clsx` / `tailwind-merge`. No conflict resolution — order the classes
 * so the intended one wins, or pass an explicit override last.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
