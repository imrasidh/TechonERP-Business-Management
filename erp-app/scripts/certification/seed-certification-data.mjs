#!/usr/bin/env node
/**
 * CLI: generate official TechonERP certification dataset backup.
 * npm run seed:certification -- --size=medium --tax=off --costing=wac
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildCertificationDataset } from "../../src/certification/buildCertificationDataset.js";
import { validateJsonBackupPayload } from "../../src/productionConfig.js";

function arg(name, fallback) {
  var hit = process.argv.find(function (a) { return a.indexOf("--" + name + "=") === 0; });
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

var __dir = dirname(fileURLToPath(import.meta.url));
var outDir = join(__dir, "..", "..", "demo-data");
var size = arg("size", "medium");
var tax = String(arg("tax", "off")).toLowerCase();
var taxPct = parseFloat(arg("taxPct", "15")) || 15;
var costing = String(arg("costing", "wac")).toLowerCase();
var neg = String(arg("negative", "block")).toLowerCase();

var outFile = join(outDir, "techon-certification-" + size + ".json");

var result = await buildCertificationDataset({
  businessType: "computer_shop",
  datasetSize: size,
  taxEnabled: tax === "on",
  taxPercent: taxPct,
  inventoryCosting: costing === "fifo" ? "fifo" : "wac",
  negativeStock: neg,
  country: "Sri Lanka",
  currency: "Rs",
}, function (p) {
  process.stdout.write("\r[" + Math.round(p.pct) + "%] " + p.phase + "          ");
});

process.stdout.write("\n");

if (!validateJsonBackupPayload(result.backup)) {
  console.error("Certification backup failed validation.");
  process.exit(1);
}
if (!result.verification || !result.verification.ok) {
  console.error("Verification FAILED:");
  (result.verification && result.verification.failed || []).forEach(function (f) {
    console.error("  -", f.message);
  });
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(result.backup, null, 2), "utf8");

var s = result.summary;
console.log("Certification dataset written:", outFile);
console.log("Login after restore: admin /", s.adminLogin.password);
console.log("Products", s.products, "| Sales", s.sales, "| Purchases", s.purchases, "| Repairs", s.repairs);
console.log("Inventory value", s.totalInventoryValue, "| Profit", s.profit);
console.log("Verification: PASSED (" + result.verification.checks.length + " checks)");
if (result.warnings && result.warnings.length) {
  console.log("Warnings:", result.warnings.length);
}
