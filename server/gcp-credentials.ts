import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let ensured = false;

/**
 * On Vercel (and similar hosts) prefer GOOGLE_SERVICE_ACCOUNT_JSON over a
 * filesystem path. Writes the JSON once per process to a temp file and sets
 * GOOGLE_APPLICATION_CREDENTIALS for Google client libraries.
 */
export function ensureGoogleCredentials(): void {
  if (ensured) return;
  ensured = true;

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return;
  }

  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!json) return;

  const file = path.join(os.tmpdir(), "gcp-sa.json");
  fs.writeFileSync(file, json, "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = file;
}

export function googleCredentialsConfigured(): boolean {
  ensureGoogleCredentials();
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim());
}
