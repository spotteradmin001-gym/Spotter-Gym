import "./db/load-env";

import { defineConfig } from "drizzle-kit";

import { getMigrationUrl } from "./db/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: getMigrationUrl(),
  },
});
