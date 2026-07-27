/**
 * Standalone operational smoke — POS sale path through production GL stack.
 */
import { createSandbox } from "../../src/certification/runner/harness.js";
import { summarizeBackupForRestore } from "../../src/ops/backupPreview.js";
import { validateJsonBackupPayload } from "../../src/productionConfig.js";

export function runStandaloneSmokeTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var sb = createSandbox({ taxEnabled: false });
  var productId = sb.nextId("prod");
  sb.state.products.push({
    id: productId,
    name: "Smoke Widget",
    stock: 100,
    cost: 50,
    price: 100,
    unit: "Pcs",
    status: "active",
  });

  var saleId = sb.nextId("sale");
  sb.state.sales.push({
    id: saleId,
    invoiceNo: "SMK-001",
    date: "2026-07-27",
    customerName: "Walk-in",
    items: [{ id: productId, name: "Smoke Widget", qty: 2, price: 100, cost: 50 }],
    total: 200,
    paid: 200,
    balance: 0,
    payStatus: "Paid",
    paymentHistory: [{ id: sb.nextId("pay"), amount: 200, method: "Cash", date: "2026-07-27" }],
    createdAt: new Date().toISOString(),
  });

  var commit = sb.verifyBooks("smoke_sale");
  if (!commit || !commit.ok) return fail("Standalone smoke: GL commit", commit && commit.error);

  var backup = {
    version: 2,
    timestamp: new Date().toISOString(),
    shopName: sb.state.settings.shopName,
    data: {
      tc3_settings: sb.state.settings,
      tc3_products: sb.state.products,
      tc3_sales: sb.state.sales,
      tc3_journal_lines: sb.smock.get("tc3_journal_lines", []),
      tc3_gl_accounts: sb.smock.get("tc3_gl_accounts", []),
      tc3_gl_mode: "live",
      tc3_journal_hash: sb.smock.get("tc3_journal_hash", ""),
      tc3_inventory_layers: sb.smock.get("tc3_inventory_layers", {}),
    },
  };

  if (!validateJsonBackupPayload(backup)) return fail("Standalone smoke: backup validates");
  var preview = summarizeBackupForRestore(backup);
  if (!preview.valid || preview.sales !== 1 || preview.journalLines < 1) {
    return fail("Standalone smoke: backup preview", JSON.stringify(preview));
  }
  if (!preview.trialBalanceOk) return fail("Standalone smoke: trial balance balanced in preview");

  pass("Standalone smoke — POS sale → GL → backup preview");
}

if (process.argv[1] && String(process.argv[1]).replace(/\\/g, "/").endsWith("standalone-smoke.test.mjs")) {
  runStandaloneSmokeTests({
    pass: function (name) { console.log("PASS —", name); },
    fail: function (name, detail) {
      console.error("FAIL —", name, detail != null ? detail : "");
      process.exitCode = 1;
    },
  });
  process.exit(process.exitCode || 0);
}
