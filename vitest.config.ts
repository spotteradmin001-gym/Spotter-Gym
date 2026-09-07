import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "vitest/config";

// `vitest run` has no ambient env loading. db/** integration suites (added in
// later phases) read DATABASE_URL, so pull local env files into process.env the
// same lazy way db/load-env.ts does, without a dotenv dependency.
if (!process.env.DATABASE_URL) {
  for (const file of [".env", ".env.local"]) {
    if (existsSync(file)) {
      try {
        process.loadEnvFile(file);
      } catch {
        // ignore — suites that need the DB will fail loudly on their own
      }
    }
  }
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Outside Next's bundler there's no "react-server" condition to pick
      // server-only's inert build, so point it at the same empty module.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    // Integration suites share one Neon branch; run files in a single queue so
    // count-based fixtures in one suite can't race another.
    fileParallelism: false,
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "db/**/*.test.ts",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "test/**/*.test.ts",
    ],
  },
});
