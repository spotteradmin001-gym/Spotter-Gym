import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // `pg` is a native-ish driver — keep it out of the server bundle so it loads
  // from node_modules at runtime.
  serverExternalPackages: ["pg"],
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
