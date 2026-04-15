import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secretPath = path.join(root, "tc_license_secret.txt");

try {
  if (fs.existsSync(secretPath)) {
    fs.unlinkSync(secretPath);
    console.log("[dist] Removed temporary tc_license_secret.txt.");
  } else {
    console.log("[dist] No temporary tc_license_secret.txt to remove.");
  }
} catch (err) {
  console.error("[dist] Failed to remove tc_license_secret.txt:", err && err.message ? err.message : err);
  process.exit(1);
}
