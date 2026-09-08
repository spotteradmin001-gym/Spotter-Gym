import { defineConfig, devices } from "@playwright/test";

/**
 * Local-only happy-path E2E. NOT part of `npm test` or CI `verify` — it needs a
 * running dev server and a seeded database.
 *
 *   npm run db:seed-admin && npm run db:seed-dev
 *   npx playwright install chromium      # one time
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
