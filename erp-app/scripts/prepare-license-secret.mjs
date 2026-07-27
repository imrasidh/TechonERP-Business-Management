import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretPath = path.join(root, "tc_license_secret.txt");
const envPath = path.join(root, ".env");

/* Load .env first (without overriding existing shell env vars). */
if (fs.existsSync(envPath)) {
  const loaded = dotenv.config({ path: envPath, override: false });
  if (loaded && loaded.error) {
    console.error("[dist] Failed to load .env file.");
    process.exit(1);
  }
}

const resolvedSecret = (
  process.env.LICENSE_SECRET ||
  process.env.TC_LIC_SERVER_SECRET ||
  ""
).trim();

if (!resolvedSecret) {
  console.error("[dist] Missing LICENSE_SECRET/TC_LIC_SERVER_SECRET.");
  console.error("[dist] You can set it in shell env or erp-app/.env.");
  console.error("[dist] Refusing to package without a license secret.");
  process.exit(1);
}

const sanitized = resolvedSecret.replace(/\r?\n/g, "").trim();
if (!sanitized) {
  console.error("[dist] License secret is empty after sanitization.");
  process.exit(1);
}

fs.writeFileSync(secretPath, sanitized + "\n", { encoding: "utf8", mode: 0o600 });
console.log("[dist] Prepared tc_license_secret.txt for local/dev use only.");
console.log("[dist] Public installers must NOT ship this file — set OS env LICENSE_SECRET on each PC.");
console.log("[dist] package.json extraResources no longer includes tc_license_secret.txt.");
