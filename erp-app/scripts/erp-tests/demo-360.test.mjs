/**
 * 360° validation of demo seed data — all major modules + accounting engine.
 */
import { buildDemoBackup } from "../demo-data/buildDemoBackup.mjs";
import { validateJsonBackupPayload } from "../../src/productionConfig.js";
import { activeSales, activePurchases } from "../../src/utils/voidInvoice.js";
import { activeCodRecords } from "../../src/utils/codTracking.js";
import {
  baseState,
  makeSmock,
  rebuild,
  DEFAULT_GL_CHART,
  validateJournalBalanced,
  validateAccountingCommitInvariants,
  trialBalance,
  balanceSheetFromLedger,
  profitAndLossFromLedger,
  reconcileInventoryToLedger,
  isInventoryReconcileOk,
} from "../accounting-tests/lib/harness.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function near(a, b, msg) {
  if (Math.abs((Number(a) || 0) - (Number(b) || 0)) > 0.02) throw new Error(msg || "amount mismatch: " + a + " vs " + b);
}

function backupToState(d) {
  return Object.assign(baseState(), {
    settings: d.tc3_settings || {},
    products: d.tc3_products || [],
    customers: d.tc3_customers || [],
    suppliers: d.tc3_suppliers || [],
    sales: d.tc3_sales || [],
    purchases: d.tc3_purchases || [],
    expenses: d.tc3_expenses || [],
    salesReturns: d.tc3_salesReturns || [],
    purchaseReturns: d.tc3_purchaseReturns || [],
    repairs: d.tc3_repairs || [],
    manualPayables: d.tc3_manualPayables || [],
    damageLog: d.tc3_damageLog || [],
    assets: d.tc3_assets || [],
  });
}

function backupToSmock(d) {
  return makeSmock({
    tc3_openBal: d.tc3_openBal || null,
    tc3_manualReceivables: d.tc3_manualReceivables || [],
    tc3_manualPayables: d.tc3_manualPayables || [],
    tc3_capLedger: d.tc3_capLedger || [],
    tc3_profitDist: d.tc3_profitDist || [],
    tc3_assets: d.tc3_assets || [],
  });
}

export function runDemo360Tests(ctx) {
  var pass = ctx.pass;
  var fail = ctx.fail;
  try {
    var bk = buildDemoBackup();
    assert(validateJsonBackupPayload(bk), "demo backup validates");
    var d = bk.data;

    assert(d.tc3_businessType === "tech", "tech industry set");
    assert((d.tc3_products || []).length >= 35, "35+ products seeded");
    assert((d.tc3_customers || []).length >= 40, "40+ customers seeded");
    assert((d.tc3_suppliers || []).length >= 10, "10+ suppliers seeded");
    assert((d.tc3_sales || []).length >= 100, "100+ sales seeded");
    assert((d.tc3_purchases || []).length >= 35, "35+ purchases seeded");
    assert((d.tc3_cheques || []).length >= 12, "cheques seeded");
    assert((d.tc3_manualReceivables || []).length >= 15, "receivables seeded");
    assert((d.tc3_manualPayables || []).length >= 12, "payables seeded");
    assert((d.tc3_salesReturns || []).length >= 20, "sales returns seeded");
    assert((d.tc3_purchaseReturns || []).length >= 12, "purchase returns seeded");
    assert((d.tc3_quotations || []).length >= 25, "quotations seeded");
    assert((d.tc3_expenses || []).length >= 20, "expenses seeded");
    assert((d.tc3_damageLog || []).length >= 5, "damage write-offs seeded");
    assert((d.tc3_assets || []).length >= 4, "fixed assets seeded");
    assert((d.tc3_codRecords || []).length >= 15, "COD records seeded");
    assert((d.tc3_codWithdrawals || []).length >= 5, "COD withdrawals seeded");
    assert(d.tc3_codProfitSettings && (d.tc3_codProfitSettings.shareholders || []).length >= 2, "COD partners seeded");
    assert(d.tc3_openBal && d.tc3_openBal.completed, "opening balance set");

    assert((d.tc3_repairs || []).length >= 25, "25+ repair bills seeded");
    var withDevices = (d.tc3_repairs || []).filter(function (r) { return Array.isArray(r.devices) && r.devices.length > 0; });
    assert(withDevices.length >= 25, "repair bills use per-device model");
    var thirdPartyDevices = 0;
    (d.tc3_repairs || []).forEach(function (r) {
      (r.devices || []).forEach(function (dev) {
        if (dev.thirdParty || (dev.status || "") === "Third Party") thirdPartyDevices++;
      });
    });
    assert(thirdPartyDevices >= 6, "3rd party repair devices seeded");
    var tpPayables = (d.tc3_manualPayables || []).filter(function (mp) {
      return mp.type === "3rd Party Repair Cost" && mp.productId;
    });
    assert(tpPayables.length >= 5, "3rd party inventory-linked payables seeded");
    var repairSales = (d.tc3_sales || []).filter(function (s) { return s.fromRepairId; });
    assert(repairSales.length >= 5, "repair-linked sales seeded");
    var tpProducts = (d.tc3_products || []).filter(function (p) { return p._repair3pOneTime; });
    assert(tpProducts.length >= 5, "one-time 3rd party products seeded");

    var sales = d.tc3_sales || [];
    var partials = sales.filter(function (s) { return s.payStatus === "Partial"; });
    assert(partials.length >= 12, "multiple partial sales");
    partials.slice(0, 3).forEach(function (partial) {
      near(partial.paid + partial.balance, partial.total, "partial sale paid+balance=total (" + partial.invoiceNo + ")");
    });

    var splits = sales.filter(function (s) { return (s.paymentHistory || []).length >= 2; });
    assert(splits.length >= 12, "split / multi-method payments");
    splits.slice(0, 2).forEach(function (split) {
      var splitPaid = (split.paymentHistory || []).reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
      near(splitPaid, split.paid, "split payment sums match paid");
    });

    var chequeSales = sales.filter(function (s) {
      return (s.paymentHistory || []).some(function (p) { return p.chequeId; });
    });
    assert(chequeSales.length >= 12, "cheque-linked sales");

    var chPending = (d.tc3_cheques || []).filter(function (c) { return c.status === "Pending"; });
    assert(chPending.length >= 5, "pending cheques");

    var purPartials = (d.tc3_purchases || []).filter(function (p) { return p.status === "Partial" || p.balance > 0; });
    assert(purPartials.length >= 12, "partial/credit purchases");
    purPartials.slice(0, 2).forEach(function (purPartial) {
      near(purPartial.paidAmount + purPartial.balance, purPartial.total, "partial purchase balances");
    });

    assert(activeSales(sales).length === sales.length, "no voided demo sales");
    assert(activePurchases(d.tc3_purchases || []).length === (d.tc3_purchases || []).length, "no voided demo purchases");

    var qSent = (d.tc3_quotations || []).filter(function (q) { return q.status === "Sent" || q.status === "Accepted"; });
    assert(qSent.length >= 1, "sent/accepted quotations");

    var codActive = activeCodRecords(d.tc3_codRecords || [], sales);
    assert(codActive.length >= 15, "active COD records linked to sales");

    /* ── Accounting engine (GL rebuild from full demo state) ── */
    var st = backupToState(d);
    var Smock = backupToSmock(d);
    var x = rebuild(st, Smock);
    assert(x.r && x.r.validate && x.r.validate.ok, "GL rebuild validates: " + JSON.stringify(x.r && x.r.validate));
    assert(validateJournalBalanced(x.r.lines).ok, "journal balanced");
    assert(x.r.lines.length >= 300, "substantial journal (" + x.r.lines.length + " lines)");

    assert((d.tc3_journal_lines || []).length >= 300, "pre-built GL journal in demo backup");

    var inv = validateAccountingCommitInvariants({
      lines: x.r.lines,
      chart: x.r.chart || DEFAULT_GL_CHART,
      invDer: x.invDer,
      settings: st.settings,
      source: "demo360",
    });
    if (!inv.ok) throw new Error("commit invariants: " + JSON.stringify(inv.errors));

    var rec = reconcileInventoryToLedger(x.r.lines, x.invDer, DEFAULT_GL_CHART);
    assert(isInventoryReconcileOk(rec, st.settings),
      "inventory vs GL within tolerance (diff " + rec.difference + " Rs)");

    var tb = trialBalance(x.r.lines, DEFAULT_GL_CHART);
    assert(tb.balanced, "trial balance balanced");

    var bs = balanceSheetFromLedger(x.r.lines, DEFAULT_GL_CHART, "2026-06-27");
    assert(bs.balancedWithEarnings, "balance sheet balanced (assets = liabilities + equity + current earnings)");

    var pl = profitAndLossFromLedger(x.r.lines, DEFAULT_GL_CHART, "2026-05-01", "2026-06-27");
    assert(typeof pl.net === "number" && isFinite(pl.net), "P&L net computed");

    pass("Demo 360 — " + sales.length + " sales, GL " + x.r.lines.length + " lines, accounts OK");
  } catch (e) {
    fail("Demo 360", e && e.message);
  }
}
