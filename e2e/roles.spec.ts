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

test("the owner activity log is gone (CR-4)", async ({ page }) => {
  await login(page, "owner@demo.spotter", "DemoOwner#2026");
  await expect(page).toHaveURL(/\/owner$/);
  // The nav no longer offers it.
  await expect(page.getByRole("link", { name: "Activity" })).toHaveCount(0);
  // And the route itself is gone.
  const res = await page.goto("/owner/audit");
  expect(res?.status()).toBe(404);
});

test("the admin audit log stays admin-only (CR-4)", async ({ page }) => {
  // An owner cannot reach it — non-admin roles are bounced to login.
  await login(page, "owner@demo.spotter", "DemoOwner#2026");
  await page.goto("/admin/audit");
  await expect(page).toHaveURL(/\/login/);

  // An admin can.
  await login(page, ADMIN_EMAIL, ADMIN_PW);
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
});

test("a promotion flows owner → admin → sending (CR-10)", async ({ page }) => {
  // Owner composes and submits a text-only promotion to a known contact.
  await login(page, "owner@demo.spotter", "DemoOwner#2026");
  await page.goto("/owner/promotions/compose");
  await page.getByLabel("Message").fill("E2E promo — spring offer");
  await page.getByLabel("Known contacts").fill("9812345670");
  await page
    .locator("label", { hasText: "only added numbers" })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: /Send to admin review/ }).click();
  await expect(page.getByText("Submitted for admin review.")).toBeVisible();

  // Open the freshly-created promotion and remember its id.
  await page.goto("/owner/promotions");
  await page.locator("table tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/owner\/promotions\/[0-9a-f-]+$/);
  const id = page.url().split("/").pop()!;

  // Admin prices it.
  await login(page, ADMIN_EMAIL, ADMIN_PW);
  await page.goto(`/admin/promotions/${id}`);
  await page.getByLabel("Charge per message (paise)").fill("50");
  await page.getByRole("button", { name: "Set price" }).click();
  await expect(page.getByText("Priced.")).toBeVisible();

  // Owner approves the estimate, then marks it prepaid.
  await login(page, "owner@demo.spotter", "DemoOwner#2026");
  await page.goto(`/owner/promotions/${id}`);
  await page.getByRole("button", { name: /Approve estimate/ }).click();
  await page.getByRole("button", { name: /I have prepaid/ }).click();

  // Admin marks it paid and (mock) sends — no engine, status just moves.
  await login(page, ADMIN_EMAIL, ADMIN_PW);
  await page.goto(`/admin/promotions/${id}`);
  await page.getByRole("button", { name: /Mark paid/ }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Sending", { exact: false })).toBeVisible();
});

test("the owner staff-activity view is owner-only (CR-5)", async ({ page }) => {
  // A member cannot reach it — every non-owner role hits the same requireOwner
  // guard and is bounced to login (employees included).
  await login(page, "member@demo.spotter", "DemoMember#2026");
  await page.goto("/owner/staff-activity");
  await expect(page).toHaveURL(/\/login/);

  // The owner can, and the nav offers it.
  await login(page, "owner@demo.spotter", "DemoOwner#2026");
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByRole("link", { name: "Staff activity" })).toBeVisible();
  await page.goto("/owner/staff-activity");
  await expect(
    page.getByRole("heading", { name: /Staff activity/ }),
  ).toBeVisible();
});
