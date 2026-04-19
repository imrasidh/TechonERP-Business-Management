#!/usr/bin/env node
/**
 * Dry-run / apply raw_material catalogue price+cost from latest purchase lines.
 *
 * Usage:
 *   node scripts/raw-material-pricing-backfill.mjs path/to/backup.json
 *   node scripts/raw-material-pricing-backfill.mjs path/to/backup.json --apply --out=out.json
 */

import fs from "node:fs";
import path from "node:path";

import {
  computeRawMaterialPricingBackfillPlan,
  applyRawMaterialPricingPlanToProducts,
} from "../src/utils/rawMaterialPricingBackfill.js";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function makeAuditEntry(action, reference, details) {
  return {
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    timestamp: new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    action: action,
    reference: reference || "",
    user: "Script",
    role: "admin",
    terminal: "raw-material-pricing-backfill",
    details: details || null,
  };
}

function usage() {
  console.log("Raw material pricing backfill");
  console.log("");
  console.log("  node scripts/raw-material-pricing-backfill.mjs <backup.json>");
  console.log("  node scripts/raw-material-pricing-backfill.mjs <backup.json> --apply --out=output.json");
  console.log("");
}

function fail(msg) {
  console.error("ERROR:", msg);
  process.exit(1);
}

function main() {
  var args = process.argv.slice(2);
  var apply = args.indexOf("--apply") >= 0;
  var outArg = args.find(function (a) {
    return a.startsWith("--out=");
  });
  var outPath = outArg ? outArg.slice("--out=".length) : "";
  var files = args.filter(function (a) {
    return !a.startsWith("--");
  });
  var inPath = files[0];
  if (!inPath) {
    usage();
    fail("Missing backup.json path.");
  }
  if (!fs.existsSync(inPath)) fail("File not found: " + inPath);

  var raw = fs.readFileSync(inPath, "utf8");
  var bak;
  try {
    bak = JSON.parse(raw);
  } catch (e) {
    fail("Invalid JSON");
  }

  var data = bak.data || bak;
  var products = data.tc3_products || [];
  var purchases = data.tc3_purchases || [];
  var plan = computeRawMaterialPricingBackfillPlan(products, purchases);

  console.log("");
  console.log("Dry-run summary");
  console.log("  Changes:", plan.changes.length);
  console.log("  Skipped:", plan.skipped.length);
  console.log("");

  plan.changes.forEach(function (ch, i) {
    console.log(
      (i + 1) + ". " + ch.name +
        " | cost " + ch.oldCost + " -> " + ch.newCost +
        " | price " + ch.oldPrice + " -> " + ch.newPrice +
        " | purchase " + ch.purchaseDate
    );
  });

  if (!apply) {
    console.log("");
    console.log("(No file written — add --apply --out=file.json to write updated backup)");
    process.exit(0);
  }

  if (!outPath) fail("--apply requires --out=path/to/output.json");

  var np = applyRawMaterialPricingPlanToProducts(products, plan);
  data.tc3_products = np;

  var auditLog = Array.isArray(data.tc3_auditLog) ? data.tc3_auditLog : [];
  plan.changes.forEach(function (ch) {
    auditLog.unshift(
      makeAuditEntry("Raw material pricing backfill", ch.name, {
        productId: ch.id,
        oldPrice: ch.oldPrice,
        newPrice: ch.newPrice,
        oldCost: ch.oldCost,
        newCost: ch.newCost,
        purchaseDate: ch.purchaseDate,
        purchaseInvoiceNo: ch.purchaseInvoiceNo,
        purchaseId: ch.purchaseId,
      })
    );
  });
  if (auditLog.length > 1000) auditLog.length = 1000;
  data.tc3_auditLog = auditLog;

  var outObj = bak.data !== undefined ? Object.assign({}, bak, { data: data }) : Object.assign({}, bak);
  fs.writeFileSync(outPath, JSON.stringify(outObj, null, 2), "utf8");
  console.log("");
  console.log("Wrote:", path.resolve(outPath));
  process.exit(0);
}

main();
