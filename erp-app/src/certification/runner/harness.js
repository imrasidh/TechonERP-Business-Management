/**
 * Certification Runner harness — in-memory sandbox that commits through
 * production inventory + GL engines (same stack as live persistTechonGLJournal).
 */

import {
  rebuildJournalFromState,
  DEFAULT_GL_CHART,
  trialBalance,
  balanceSheetFromLedger,
  profitAndLossFromLedger,
  validateJournalBalanced,
  ledgerCashBank,
  ledgerARAP,
  hashJournalLines,
  round2,
} from "../../accounting/generalLedger.js";
import {
  deriveInventoryEconomics,
  reconcileInventoryToLedger,
  isInventoryReconcileOk,
} from "../../accounting/inventoryEngine.js";
import { validateAccountingCommitInvariants } from "../../accounting/commitInvariants.js";
import { validateJsonBackupPayload } from "../../productionConfig.js";

export { round2, DEFAULT_GL_CHART, trialBalance, balanceSheetFromLedger, profitAndLossFromLedger, ledgerCashBank, ledgerARAP, hashJournalLines, validateJsonBackupPayload };

export function near(a, b, tol) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= (tol != null ? tol : 0.02);
}

export function makeUid(prefix) {
  var n = 0;
  var p = prefix || "cert_run_";
  return function () {
    n += 1;
    return p + n;
  };
}

export function createSandbox(opts) {
  opts = opts || {};
  var costing = opts.inventoryCostingMethod === "fifo" ? "fifo" : "wac";
  var taxOn = opts.taxEnabled === true;
  var taxPct = Number(opts.taxPercent) || 15;
  var preventNeg = opts.preventNegativeStock !== false;

  var state = {
    settings: {
      shopName: "Certification Runner Shop",
      currency: opts.currency || "Rs",
      taxEnabled: taxOn,
      taxMode: "exclusive",
      selectedTaxes: taxOn ? [{ name: "VAT", rate: taxPct, amount: 0 }] : [],
      glVatPostingEnabled: taxOn,
      inventoryCostingMethod: costing,
      preventNegativeStock: preventNeg,
      strictPeriodLock: false,
      lockedUntilDate: "",
      glArApNegativeTolerance: 50,
      glArApHardBlockAt: 1000000,
      glInventoryReconcileTolerance: costing === "fifo" ? 5000 : 25000,
    },
    products: [],
    customers: [],
    suppliers: [],
    sales: [],
    purchases: [],
    expenses: [],
    salesReturns: [],
    purchaseReturns: [],
    cheques: [],
    repairs: [],
    damageLog: [],
    assets: [],
    quotations: [],
    others: [],
  };

  var store = {
    tc3_openBal: opts.openBal || {
      completed: true,
      date: "2026-04-01",
      cash: 500000,
      bank: 1500000,
      note: "Runner opening balances",
    },
    tc3_manualReceivables: [],
    tc3_manualPayables: [],
    tc3_capLedger: opts.capLedger || [
      { id: "cap_run_1", type: "invest", amount: 2000000, cashMethod: "Bank", date: "2026-04-01", note: "Capital", ref: "CAP-R1" },
    ],
    tc3_profitDist: [],
    tc3_assets: [],
    tc3_gl_accounts: DEFAULT_GL_CHART,
    tc3_journal_lines: [],
    tc3_journal_hash: "",
  };

  var smock = {
    get: function (k, def) {
      return store[k] !== undefined ? store[k] : def;
    },
    set: function (k, v) {
      store[k] = v;
    },
    _store: store,
  };

  /* Keep assets on both state and store (GL reads assets from state; money in/out from smock). */
  Object.defineProperty(state, "assets", {
    get: function () { return store.tc3_assets; },
    set: function (v) { store.tc3_assets = v || []; },
    configurable: true,
    enumerable: true,
  });

  var uid = makeUid("cr_");
  var seq = { n: 0 };
  function nextId(prefix) {
    seq.n += 1;
    return (prefix || "id") + "_" + seq.n;
  }

  function rebuild() {
    var invDer = deriveInventoryEconomics(state, smock);
    var r = rebuildJournalFromState(state, smock, uid, invDer);
    if (r && r.lines) {
      store.tc3_journal_lines = r.lines;
      store.tc3_gl_accounts = r.chart || DEFAULT_GL_CHART;
      store.tc3_journal_hash = hashJournalLines(r.lines);
    }
    return { r: r, invDer: invDer };
  }

  /**
   * Full post-commit verification (production commit stack).
   * @returns {{ ok: boolean, checks: object, error?: string, detail?: any }}
   */
  function verifyBooks(label) {
    var tag = label || "books";
    try {
      var x = rebuild();
      if (!x.r || !x.r.validate || !x.r.validate.ok) {
        return { ok: false, error: tag + ": GL rebuild failed", detail: x.r && x.r.validate, checks: {} };
      }
      var lines = x.r.lines || [];
      var chart = x.r.chart || DEFAULT_GL_CHART;
      var jb = validateJournalBalanced(lines);
      if (!jb.ok) return { ok: false, error: tag + ": journal not balanced", detail: jb, checks: {} };

      var inv = validateAccountingCommitInvariants({
        lines: lines,
        chart: chart,
        invDer: x.invDer,
        settings: state.settings,
        source: "certification_runner",
      });
      if (!inv.ok) return { ok: false, error: tag + ": commit invariants", detail: inv.errors, checks: {} };

      var tb = trialBalance(lines, chart);
      if (!tb.balanced) return { ok: false, error: tag + ": Trial Balance imbalance", detail: tb, checks: {} };

      var bs = balanceSheetFromLedger(lines, chart, null);
      if (!bs.balancedWithEarnings) {
        return { ok: false, error: tag + ": Balance Sheet imbalance", detail: bs, checks: {} };
      }

      var pl = profitAndLossFromLedger(lines, chart, null, null);
      if (!(typeof pl.net === "number" && isFinite(pl.net))) {
        return { ok: false, error: tag + ": P&L failed", detail: pl, checks: {} };
      }

      var rec = reconcileInventoryToLedger(lines, x.invDer, chart);
      if (!isInventoryReconcileOk(rec, state.settings)) {
        return {
          ok: false,
          error: tag + ": Inventory ≠ GL (diff " + round2(rec.difference || 0) + ")",
          detail: rec,
          checks: {},
        };
      }

      var cb = ledgerCashBank(lines);
      var aa = ledgerARAP(lines);

      /* Customer / supplier invoice arithmetic */
      var badCust = 0;
      (state.sales || []).forEach(function (s) {
        if (!s || s.status === "Voided" || s.status === "Cancelled") return;
        if (Math.abs((Number(s.paid) || 0) + (Number(s.balance) || 0) - (Number(s.total) || 0)) > 0.05) badCust++;
      });
      if (badCust) return { ok: false, error: tag + ": " + badCust + " customer invoices paid+balance ≠ total", checks: {} };

      var badSup = 0;
      (state.purchases || []).forEach(function (p) {
        if (!p || p.status === "Voided" || p.status === "Cancelled") return;
        if (Math.abs((Number(p.paidAmount) || 0) + (Number(p.balance) || 0) - (Number(p.total) || 0)) > 0.05) badSup++;
      });
      if (badSup) return { ok: false, error: tag + ": " + badSup + " supplier invoices paid+balance ≠ total", checks: {} };

      /* Negative stock policy */
      if (state.settings.preventNegativeStock) {
        var neg = (state.products || []).filter(function (p) {
          return p && p.type !== "service" && (Number(p.stock) || 0) < -1e-9;
        });
        if (neg.length) {
          return { ok: false, error: tag + ": negative stock under Block (" + neg[0].name + ")", detail: neg[0], checks: {} };
        }
      }

      return {
        ok: true,
        checks: {
          journal: true,
          trialBalance: true,
          balanceSheet: true,
          profitAndLoss: true,
          inventoryEqGl: true,
          customerBalance: true,
          supplierBalance: true,
          cashBook: true,
          bankBook: true,
          negativeStock: true,
          cash: cb.cash,
          bank: cb.bank,
          ar: aa.receivables,
          ap: aa.payables,
          plNet: pl.net,
          invDiff: round2(rec.difference || 0),
          journalLines: lines.length,
          journalHash: store.tc3_journal_hash,
        },
        x: x,
        lines: lines,
        chart: chart,
      };
    } catch (e) {
      return {
        ok: false,
        error: tag + ": " + ((e && e.message) || String(e)),
        detail: e && e.stack,
        checks: {},
      };
    }
  }

  function snapshotBooks() {
    var v = verifyBooks("snapshot");
    if (!v.ok) return null;
    return {
      hash: v.checks.journalHash,
      tbDebit: trialBalance(v.lines, v.chart).totalDebit,
      cash: v.checks.cash,
      bank: v.checks.bank,
      ar: v.checks.ar,
      ap: v.checks.ap,
      plNet: v.checks.plNet,
      invDiff: v.checks.invDiff,
      productStock: (state.products || []).map(function (p) {
        return { id: p.id, stock: p.stock, cost: p.cost };
      }),
    };
  }

  function buildBackupObject() {
    return {
      version: 2,
      timestamp: new Date().toISOString(),
      shopName: state.settings.shopName,
      certificationRunner: true,
      data: {
        tc3_settings: state.settings,
        tc3_products: state.products,
        tc3_customers: state.customers,
        tc3_suppliers: state.suppliers,
        tc3_others: state.others || [],
        tc3_sales: state.sales,
        tc3_purchases: state.purchases,
        tc3_expenses: state.expenses,
        tc3_salesReturns: state.salesReturns,
        tc3_purchaseReturns: state.purchaseReturns,
        tc3_cheques: state.cheques,
        tc3_repairs: state.repairs,
        tc3_damageLog: state.damageLog,
        tc3_quotations: state.quotations,
        tc3_openBal: store.tc3_openBal,
        tc3_manualReceivables: store.tc3_manualReceivables,
        tc3_manualPayables: store.tc3_manualPayables,
        tc3_capLedger: store.tc3_capLedger,
        tc3_profitDist: store.tc3_profitDist,
        tc3_assets: store.tc3_assets,
        tc3_journal_lines: store.tc3_journal_lines,
        tc3_gl_accounts: store.tc3_gl_accounts,
        tc3_journal_hash: store.tc3_journal_hash,
        tc3_businessType: "tech",
      },
    };
  }

  function restoreFromBackup(backup) {
    if (!validateJsonBackupPayload(backup)) throw new Error("Invalid backup payload");
    var d = backup.data || {};
    state.settings = d.tc3_settings || state.settings;
    state.products = d.tc3_products || [];
    state.customers = d.tc3_customers || [];
    state.suppliers = d.tc3_suppliers || [];
    state.others = d.tc3_others || [];
    state.sales = d.tc3_sales || [];
    state.purchases = d.tc3_purchases || [];
    state.expenses = d.tc3_expenses || [];
    state.salesReturns = d.tc3_salesReturns || [];
    state.purchaseReturns = d.tc3_purchaseReturns || [];
    state.cheques = d.tc3_cheques || [];
    state.repairs = d.tc3_repairs || [];
    state.damageLog = d.tc3_damageLog || [];
    state.quotations = d.tc3_quotations || [];
    store.tc3_openBal = d.tc3_openBal || null;
    store.tc3_manualReceivables = d.tc3_manualReceivables || [];
    store.tc3_manualPayables = d.tc3_manualPayables || [];
    store.tc3_capLedger = d.tc3_capLedger || [];
    store.tc3_profitDist = d.tc3_profitDist || [];
    store.tc3_assets = d.tc3_assets || [];
    store.tc3_journal_lines = d.tc3_journal_lines || [];
    store.tc3_gl_accounts = d.tc3_gl_accounts || DEFAULT_GL_CHART;
    store.tc3_journal_hash = d.tc3_journal_hash || "";
  }

  return {
    state: state,
    smock: smock,
    store: store,
    nextId: nextId,
    rebuild: rebuild,
    verifyBooks: verifyBooks,
    snapshotBooks: snapshotBooks,
    buildBackupObject: buildBackupObject,
    restoreFromBackup: restoreFromBackup,
  };
}
