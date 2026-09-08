/**
 * Portal navigation helpers.
 *
 * `isActivePath` decides whether a nav link should render as the current
 * section. A single-segment href (a section root such as `/owner` or
 * `/admin`) matches only its exact path, otherwise every deeper page would
 * light it up too. A deeper href (`/owner/members`) also matches its own
 * child routes (`/owner/members/123`).
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (!pathname || !href) return false;
  if (pathname === href) return true;

  const segments = href.split("/").filter(Boolean);
  if (segments.length < 2) return false;

  return pathname.startsWith(href + "/");
}
