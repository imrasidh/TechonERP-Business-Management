/**
 * Post-generation verification for the official Certification Dataset.
 * Uses the same GL / inventory engines as production.
 */

import {
  rebuildJournalFromState,
  DEFAULT_GL_CHART,
  trialBalance,
  balanceSheetFromLedger,
  profitAndLossFromLedger,
  validateJournalBalanced,
  ledgerCashBank,
} from "../accounting/generalLedger.js";
import {
  deriveInventoryEconomics,
  reconcileInventoryToLedger,
  isInventoryReconcileOk,
} from "../accounting/inventoryEngine.js";
import { validateAccountingCommitInvariants } from "../accounting/commitInvariants.js";
import { activeSales, activePurchases, isVoidedTxn } from "../utils/voidInvoice.js";
import { validateJsonBackupPayload } from "../productionConfig.js";
import { round2 } from "./util.js";

function check(checks, ok, code, message) {
  checks.push({ ok: !!ok, code: code, message: message });
  return !!ok;
}

function uniqueIds(rows, idKey) {
  var seen = {};
  var dups = [];
  (rows || []).forEach(function (r) {
    if (!r || r[idKey] == null) return;
    var k = String(r[idKey]);
    if (seen[k]) dups.push(k);
    else seen[k] = true;
  });
  return dups;
}

function backupToState(d) {
  return {
    settings: d.tc3_settings || {},
    products: d.tc3_products || [],
    customers: d.tc3_customers || [],
    suppliers: d.tc3_suppliers || [],
    sales: d.tc3_sales || [],
    purchases: d.tc3_purchases || [],
    expenses: d.tc3_expenses || [],
    salesReturns: d.tc3_salesReturns || [],
    purchaseReturns: d.tc3_purchaseReturns || [],
    cheques: d.tc3_cheques || [],
    repairs: d.tc3_repairs || [],
    manualPayables: d.tc3_manualPayables || [],
    damageLog: d.tc3_damageLog || [],
    assets: d.tc3_assets || [],
  };
}

function backupToSmock(d) {
  return {
    get: function (k, def) {
      return d[k] !== undefined ? d[k] : def;
    },
  };
}

/**
 * @param {object} backup
 * @param {{ warnings?: string[] }} [opts]
 */
export function verifyCertificationDataset(backup, opts) {
  var checks = [];
  var warnings = (opts && opts.warnings ? opts.warnings.slice() : []) || [];
  var d = (backup && backup.data) || {};

  check(checks, validateJsonBackupPayload(backup), "backup_shape", "Backup JSON shape is valid");
  check(checks, !!(d.tc3_openBal && d.tc3_openBal.completed), "opening_balance", "Opening balance completed");
  check(checks, (d.tc3_products || []).length > 0, "products", "Products present");
  check(checks, (d.tc3_customers || []).length > 0, "customers", "Customers present");
  check(checks, (d.tc3_suppliers || []).length > 0, "suppliers", "Suppliers present");
  check(checks, (d.tc3_sales || []).length > 0, "sales", "Sales present");
  check(checks, (d.tc3_purchases || []).length > 0, "purchases", "Purchases present");

  var idSets = [
    ["products", d.tc3_products],
    ["customers", d.tc3_customers],
    ["suppliers", d.tc3_suppliers],
    ["sales", d.tc3_sales],
    ["purchases", d.tc3_purchases],
    ["repairs", d.tc3_repairs],
    ["cheques", d.tc3_cheques],
  ];
  idSets.forEach(function (pair) {
    var dups = uniqueIds(pair[1], "id");
    check(checks, dups.length === 0, "unique_" + pair[0], dups.length ? ("Duplicate IDs in " + pair[0] + ": " + dups.slice(0, 5).join(", ")) : ("No duplicate IDs in " + pair[0]));
  });

  /* Orphan / broken references */
  var productIds = {};
  (d.tc3_products || []).forEach(function (p) { if (p && p.id != null) productIds[String(p.id)] = true; });
  var customerIds = {};
  (d.tc3_customers || []).forEach(function (c) { if (c && c.id != null) customerIds[String(c.id)] = true; });
  var saleIds = {};
  (d.tc3_sales || []).forEach(function (s) { if (s && s.id != null) saleIds[String(s.id)] = true; });
  var purchaseIds = {};
  (d.tc3_purchases || []).forEach(function (p) { if (p && p.id != null) purchaseIds[String(p.id)] = true; });

  var orphanSaleLines = 0;
  (d.tc3_sales || []).forEach(function (s) {
    (s.items || []).forEach(function (it) {
      if (it && it.id && !productIds[String(it.id)]) orphanSaleLines++;
    });
  });
  check(checks, orphanSaleLines === 0, "orphan_sale_lines", orphanSaleLines ? (orphanSaleLines + " sale lines reference missing products") : "No orphan sale line product refs");

  var orphanReturns = 0;
  (d.tc3_salesReturns || []).forEach(function (r) {
    if (r && r.invoiceId && !saleIds[String(r.invoiceId)]) orphanReturns++;
  });
  (d.tc3_purchaseReturns || []).forEach(function (r) {
    if (r && r.purchaseId && !purchaseIds[String(r.purchaseId)]) orphanReturns++;
  });
  check(checks, orphanReturns === 0, "orphan_returns", orphanReturns ? (orphanReturns + " returns reference missing parents") : "No orphan return refs");

  /* Negative stock policy */
  var preventNeg = !!(d.tc3_settings && d.tc3_settings.preventNegativeStock !== false);
  var negStock = (d.tc3_products || []).filter(function (p) {
    return p && p.type !== "service" && (Number(p.stock) || 0) < -0.0001;
  });
  if (preventNeg) {
    check(checks, negStock.length === 0, "negative_stock", negStock.length ? (negStock.length + " products have negative stock while Block is enabled") : "No negative quantities (Block policy)");
  } else {
    check(checks, true, "negative_stock", "Negative stock allowed by configuration (" + negStock.length + " negative SKUs)");
  }

  /* Customer / supplier statement balance sanity: paid + balance ≈ total on active docs */
  var custBalOk = true;
  activeSales(d.tc3_sales || []).forEach(function (s) {
    var sum = round2((Number(s.paid) || 0) + (Number(s.balance) || 0));
    if (Math.abs(sum - (Number(s.total) || 0)) > 0.05) custBalOk = false;
  });
  check(checks, custBalOk, "customer_statements", custBalOk ? "Customer invoice paid+balance matches totals" : "Some customer invoices paid+balance ≠ total");

  var supBalOk = true;
  activePurchases(d.tc3_purchases || []).forEach(function (p) {
    var sum = round2((Number(p.paidAmount) || 0) + (Number(p.balance) || 0));
    if (Math.abs(sum - (Number(p.total) || 0)) > 0.05) supBalOk = false;
  });
  check(checks, supBalOk, "supplier_statements", supBalOk ? "Supplier invoice paid+balance matches totals" : "Some supplier invoices paid+balance ≠ total");

  /* Accounting engines */
  var st = backupToState(d);
  var Smock = backupToSmock(d);
  var glSeq = 0;
  var invDer = deriveInventoryEconomics(st, Smock);
  var r = rebuildJournalFromState(st, Smock, function () {
    glSeq += 1;
    return "cert_verify_" + glSeq;
  }, invDer);

  check(checks, !!(r && r.validate && r.validate.ok), "gl_rebuild", r && r.validate && r.validate.ok ? "GL rebuild validates" : ("GL rebuild failed: " + JSON.stringify(r && r.validate)));

  var lines = (r && r.lines) || [];
  var chart = (r && r.chart) || DEFAULT_GL_CHART;
  var jb = validateJournalBalanced(lines);
  check(checks, !!(jb && jb.ok), "journal_balanced", jb && jb.ok ? "Journal lines balance" : "Journal not balanced");

  var inv = validateAccountingCommitInvariants({
    lines: lines,
    chart: chart,
    invDer: invDer,
    settings: st.settings,
    source: "certification",
  });
  check(checks, !!(inv && inv.ok), "commit_invariants", inv && inv.ok ? "Commit invariants OK" : ("Commit invariants: " + JSON.stringify(inv && inv.errors)));

  var rec = reconcileInventoryToLedger(lines, invDer, chart);
  var invOk = isInventoryReconcileOk(rec, st.settings);
  check(checks, invOk, "inventory_valuation", invOk
    ? ("Inventory valuation matches engine (diff " + round2(rec.difference || 0) + ")")
    : ("Inventory vs GL mismatch (diff " + round2(rec.difference || 0) + ")"));

  var tb = trialBalance(lines, chart);
  check(checks, !!(tb && tb.balanced), "trial_balance", tb && tb.balanced
    ? ("Trial Balance balances (Dr " + round2(tb.totalDebit) + " / Cr " + round2(tb.totalCredit) + ")")
    : "Trial Balance does not balance");

  var asOf = new Date().toISOString().slice(0, 10);
  var bs = balanceSheetFromLedger(lines, chart, asOf);
  check(checks, !!(bs && bs.balancedWithEarnings), "balance_sheet", bs && bs.balancedWithEarnings
    ? "Balance Sheet balances (assets = liabilities + equity + earnings)"
    : "Balance Sheet does not balance");

  var pl = profitAndLossFromLedger(lines, chart, null, asOf);
  check(checks, typeof (pl && pl.net) === "number" && isFinite(pl.net), "profit_loss", "Profit & Loss computes (net " + round2(pl && pl.net) + ")");

  var cashBank = ledgerCashBank(lines);
  check(checks, !!(cashBank && typeof cashBank.cash === "number"), "cash_book", "Cash book derived from ledger");
  check(checks, !!(cashBank && typeof cashBank.bank === "number"), "bank_book", "Bank book derived from ledger");

  /* Voided docs should not be in active sets incorrectly counted — soft check */
  var voidedSales = (d.tc3_sales || []).filter(isVoidedTxn).length;
  if (voidedSales > 0) {
    check(checks, activeSales(d.tc3_sales).length === (d.tc3_sales || []).length - voidedSales, "voided_sales_excluded", "Voided sales excluded from active set");
  }

  var failed = checks.filter(function (c) { return !c.ok; });
  if (failed.length) {
    failed.forEach(function (f) { warnings.push(f.message); });
  }

  return {
    ok: failed.length === 0,
    checks: checks,
    failed: failed,
    warnings: warnings,
    metrics: {
      trialBalance: tb ? { debit: tb.totalDebit, credit: tb.totalCredit, balanced: tb.balanced } : null,
      balanceSheet: bs ? { balancedWithEarnings: bs.balancedWithEarnings } : null,
      profit: pl ? round2(pl.net) : null,
      cash: cashBank ? round2(cashBank.cash) : null,
      bank: cashBank ? round2(cashBank.bank) : null,
      inventoryDiff: rec ? round2(rec.difference || 0) : null,
      journalLines: lines.length,
    },
  };
}
