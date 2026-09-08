import { expect, test, type Page } from "@playwright/test";

/**
 * Happy-path routing per role. Assumes:
 *   npm run db:seed-admin   (admin: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *                            defaults spotter.admin001@gmail.com / Startup#2026)
 *   npm run db:seed-dev     (owner@demo.spotter / DemoOwner#2026,
 *                            member@demo.spotter / DemoMember#2026)
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "spotter.admin001@gmail.com";
const ADMIN_PW = process.env.E2E_ADMIN_PW ?? "Startup#2026";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("admin lands on the gyms list", async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PW);
  await expect(page).toHaveURL(/\/admin\/gyms$/);
  await expect(page.getByRole("heading", { name: /Gyms/ })).toBeVisible();
});

test("owner lands on the gym overview", async ({ page }) => {
  await login(page, "owner@demo.spotter", "DemoOwner#2026");
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByText("Demo Gym")).toBeVisible();
  await expect(page.getByRole("link", { name: "Members" })).toBeVisible();
});

test("member reaches the member app", async ({ page }) => {
  await login(page, "member@demo.spotter", "DemoMember#2026");
  await expect(page).toHaveURL(/\/m(\/profile)?$/);
  await expect(page.getByRole("link", { name: "Payments" })).toBeVisible();
});

test("a wrong password is rejected without leaking which field", async ({ page }) => {
  await login(page, "owner@demo.spotter", "nope-nope-nope");
  await expect(page.getByRole("alert")).toContainText("Incorrect email or password");
  await expect(page).toHaveURL(/\/login/);
});
