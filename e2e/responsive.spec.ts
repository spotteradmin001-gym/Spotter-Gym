import { expect, test, type Page } from "@playwright/test";

/**
 * Mobile-viewport smoke for the responsive staff portals (CR-3).
 *
 * Same seeded fixtures as roles.spec.ts:
 *   npm run db:seed-admin   (spotter.admin001@gmail.com / Startup#2026)
 *   npm run db:seed-dev     (owner@demo.spotter / DemoOwner#2026)
 *
 * NOT in CI — needs a running dev server + seeded DB (matches the repo).
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "spotter.admin001@gmail.com";
const ADMIN_PW = process.env.E2E_ADMIN_PW ?? "Startup#2026";

test.use({ viewport: { width: 360, height: 740 } });

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** The page must not scroll sideways at 360px. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("owner dashboard is mobile-clean with a hamburger nav", async ({ page }) => {
  await login(page, "owner@demo.spotter", "DemoOwner#2026");
  await expect(page).toHaveURL(/\/owner$/);

  const hamburger = page.getByRole("button", { name: "Toggle navigation" });
  await expect(hamburger).toBeVisible();
  // The desktop inline nav row is collapsed at this width.
  await expect(page.getByRole("link", { name: "Members" })).toBeHidden();

  await expectNoHorizontalScroll(page);

  // The drawer opens and exposes the links.
  await hamburger.click();
  await expect(page.getByRole("link", { name: "Members" })).toBeVisible();
});

test("an owner table page has no horizontal scroll at 360px", async ({ page }) => {
  await login(page, "owner@demo.spotter", "DemoOwner#2026");
  await page.goto("/owner/members");
  await expect(page.getByRole("heading", { name: /Members/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Toggle navigation" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("admin gyms page is mobile-clean with a hamburger nav", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PW);
  await expect(page).toHaveURL(/\/admin\/gyms$/);
  await expect(
    page.getByRole("button", { name: "Toggle navigation" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});
