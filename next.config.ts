import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: rootDir,
  // Azure Speech SDK and similar browser packages stay client-only.
  serverExternalPackages: [
    "@google-cloud/speech",
    "@google-cloud/translate",
    "ws",
  ],
};

export default nextConfig;
