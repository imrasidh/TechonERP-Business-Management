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
console.log("Demo login after restore: username admin / password demo1234");
console.log("");
console.log("Includes:");
console.log("  • admin user + password hash (demo1234)");
console.log("  • " + (d.tc3_products || []).length + " products, " + (d.tc3_customers || []).length + " customers, " + (d.tc3_suppliers || []).length + " suppliers, " + (d.tc3_others || []).length + " other contacts");
console.log("  • " + (d.tc3_sales || []).length + " sales (paid, partial, credit, cheque, split)");
console.log("  • " + (d.tc3_purchases || []).length + " purchases (paid, partial, cheque)");
console.log("  • " + (d.tc3_cheques || []).length + " cheques (pending, cleared, bounced)");
console.log("  • " + (d.tc3_manualReceivables || []).length + " manual receivables + " + (d.tc3_manualPayables || []).length + " payables");
console.log("  • " + (d.tc3_salesReturns || []).length + " sales returns + " + (d.tc3_purchaseReturns || []).length + " purchase returns");
var convertedQuotes = (d.tc3_quotations || []).filter(function (q) { return q.status === "Converted"; }).length;
console.log("  • " + (d.tc3_quotations || []).length + " quotations (" + convertedQuotes + " converted to linked sales), " + (d.tc3_repairs || []).length + " repairs (multi-device, 3rd party, delivered), " + (d.tc3_expenses || []).length + " expenses");
var rep3p = (d.tc3_manualPayables || []).filter(function (mp) { return mp.type === "3rd Party Repair Cost"; }).length;
var repSales = (d.tc3_sales || []).filter(function (s) { return s.fromRepairId; }).length;
console.log("  • " + rep3p + " 3rd-party repair payables, " + repSales + " repair-linked sales invoices");
console.log("  • " + (d.tc3_codRecords || []).length + " COD records + " + (d.tc3_codWithdrawals || []).length + " COD withdrawals (separate module)");
console.log("  • " + (d.tc3_damageLog || []).length + " damage write-offs, " + (d.tc3_assets || []).length + " fixed assets");
console.log("  • " + (d.tc3_capLedger || []).length + " capital ledger entries, " + (d.tc3_profitDist || []).length + " profit distributions");
console.log("  • Opening cash/bank balance + pre-built GL journal (" + (d.tc3_journal_lines || []).length + " lines)");
