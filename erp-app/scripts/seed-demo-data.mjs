#!/usr/bin/env node
/**
 * Generate demo backup JSON for 360° ERP testing.
 * npm run seed:demo
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildDemoBackup } from "./demo-data/buildDemoBackup.mjs";
import { validateJsonBackupPayload } from "../src/productionConfig.js";

var __dir = dirname(fileURLToPath(import.meta.url));
var outDir = join(__dir, "..", "demo-data");
var outFile = join(outDir, "techon-demo-backup.json");

var backup = buildDemoBackup();
if (!validateJsonBackupPayload(backup)) {
  console.error("Demo backup failed validation.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(backup, null, 2), "utf8");

var d = backup.data;
console.log("Demo backup written:", outFile);
console.log("");
console.log("Import in app: Settings → Backup → Restore → select techon-demo-backup.json");
console.log("");
console.log("Includes:");
console.log("  • " + (d.tc3_products || []).length + " products, " + (d.tc3_customers || []).length + " customers, " + (d.tc3_suppliers || []).length + " suppliers");
console.log("  • " + (d.tc3_sales || []).length + " sales (paid, partial, credit, cheque, split)");
console.log("  • " + (d.tc3_purchases || []).length + " purchases (paid, partial, cheque)");
console.log("  • " + (d.tc3_cheques || []).length + " cheques (pending, cleared, bounced)");
console.log("  • " + (d.tc3_manualReceivables || []).length + " manual receivables + " + (d.tc3_manualPayables || []).length + " payables");
console.log("  • " + (d.tc3_salesReturns || []).length + " sales returns + " + (d.tc3_purchaseReturns || []).length + " purchase returns");
console.log("  • " + (d.tc3_quotations || []).length + " quotations, " + (d.tc3_expenses || []).length + " expenses");
console.log("  • Opening cash/bank balance + pre-built GL journal (757 lines)");
