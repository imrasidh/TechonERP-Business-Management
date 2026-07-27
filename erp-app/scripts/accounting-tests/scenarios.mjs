/**
 * Core accounting regression scenarios (no posting rule changes).
 */
import {
  baseState,
  balanceSheetFromLedger,
  makeSmock,
  rebuild,
  DEFAULT_GL_CHART,
  validateJournalBalanced,
  validateAccountingCommitInvariants,
  profitAndLossFromLedger,
  mergeJournalLinesByTransactionId,
  mergeRebuildWithImmutableHistory,
  collectStrictPeriodLockOverrideIds,
  evaluateArApPolicy,
  reconcileInventoryToLedger,
  deriveInventoryEconomics,
  GL,
  round2,
  sumAccount,
  signedBalanceForAccount,
} from "./lib/harness.mjs";
import { explainInventoryDifference } from "../../src/accounting/inventoryReconExplain.js";
import { buildInventoryReplayWindow } from "../../src/utils/inventoryReplayDebug.js";
import { isLockedThroughDate } from "../../src/accounting/periodLockDates.js";
import { compareRoundSumMethods } from "../../src/accounting/roundingDrift.js";
import { buildInventoryReconTimeSeries } from "../../src/accounting/inventoryReconTimeSeries.js";
import { diffTrialBalanceSnapshotVsLive } from "../../src/accounting/snapshotTbDiff.js";
import {
  aggregateKitchenCostByMonthInRange,
  sumRawMaterialKitchenCostInRange,
} from "../../src/utils/ingredientUsageCost.js";
import { computePurchaseReturnTax } from "../../src/tax/taxCompute.js";
import { diagnoseGlStorage, healGlStorageMetadata, hasGlOperationalSalesMismatch } from "../../src/ops/glStorageHealth.js";
import { trialBalance } from "../../src/accounting/generalLedger.js";

/**
 * @param {{ fail: (name: string, detail?: unknown) => void, pass: (name: string) => void }} ctx
 */
export function runScenarioTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var Smock = makeSmock();

  /* ── 1: Purchase → sale → full return ── */
  (function () {
    var st = baseState();
    var pid = "prod_reg_1";
    st.products = [{ id: pid, productId: "1010", name: "Reg", stock: 0, cost: 5, sellPrice: 10 }];
    st.purchases = [
      {
        id: "pur_reg_1",
        date: "2026-01-01",
        purchaseNo: "P1",
        total: 50,
        totalTax: 0,
        items: [{ id: pid, productId: pid, inputQty: 10, qty: 10, cost: 5 }],
        paymentHistory: [],
      },
    ];
    st.sales = [
      {
        id: "sale_reg_1",
        date: "2026-01-05",
        invoiceNo: "INV-R1",
        total: 100,
        paid: 0,
        totalTax: 0,
        items: [{ id: pid, productId: pid, qty: 2, cost: 5, lineTotal: 100 }],
        paymentHistory: [],
      },
    ];
    st.salesReturns = [
      {
        id: "sr_reg_1",
        date: "2026-01-06",
        amount: 100,
        refundAmount: 0,
        qty: 2,
        cost: 5,
      },
    ];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Sales → full return: rebuild validate", x.r.validate);
    if (!validateJournalBalanced(x.r.lines).ok) return fail("Sales → full return: journal balance");
    var inv = validateAccountingCommitInvariants({
      lines: x.r.lines,
      chart: x.r.chart || DEFAULT_GL_CHART,
      invDer: null,
      settings: st.settings,
      source: "test",
    });
    if (!inv.ok) return fail("Sales → full return: commit invariants (GL/AR/AP)", inv.errors);
    var cogs = x.r.lines.filter(function (ln) {
      return ln.referenceType && String(ln.referenceType).indexOf("cogs") >= 0;
    });
    if (cogs.length < 1) return fail("Sales → full return: COGS lines present", cogs.length);
    pass("Sales → full return (GL balanced, COGS/reversal activity)");
  })();

  /* ── 2: Purchase → purchase return ── */
  (function () {
    var st = baseState();
    var pid = "prod_reg_2";
    st.products = [{ id: pid, productId: "1011", name: "R2", stock: 0, cost: 8, sellPrice: 12 }];
    st.purchases = [
      {
        id: "pur_reg_2",
        date: "2026-02-01",
        total: 80,
        totalTax: 0,
        items: [{ id: pid, productId: pid, inputQty: 10, qty: 10, cost: 8 }],
        paymentHistory: [],
      },
    ];
    st.purchaseReturns = [{ id: "pr_reg_1", date: "2026-02-02", cost: 8, qty: 2 }];
    var x = rebuild(st, Smock);
    if (!validateJournalBalanced(x.r.lines).ok) return fail("Purchase → purchase return: balance");
    if (!validateAccountingCommitInvariants({ lines: x.r.lines, chart: x.r.chart || DEFAULT_GL_CHART, invDer: null, settings: st.settings }).ok) {
      return fail("Purchase → purchase return: invariants");
    }
    pass("Purchase → purchase return");
  })();

  /* ── 3: Partial payment + refund ── */
  (function () {
    var st = baseState();
    var pid = "prod_reg_3";
    st.products = [{ id: pid, productId: "1012", name: "R3", stock: 100, cost: 1, sellPrice: 50 }];
    st.purchases = [];
    st.sales = [
      {
        id: "sale_reg_3",
        date: "2026-03-01",
        invoiceNo: "INV-PART",
        total: 100,
        paid: 30,
        totalTax: 0,
        items: [{ id: pid, productId: pid, qty: 1, cost: 1, lineTotal: 100 }],
        paymentHistory: [{ id: "ph1", date: "2026-03-01", amount: 30, cashMethod: "Cash", note: "partial" }],
      },
    ];
    st.salesReturns = [
      {
        id: "sr_reg_2",
        date: "2026-03-02",
        amount: 20,
        refundAmount: 20,
        qty: 0,
        cost: 0,
        refundMethod: "Cash",
      },
    ];
    var x = rebuild(st, Smock);
    if (!validateJournalBalanced(x.r.lines).ok) return fail("Partial payment + refund: balance");
    if (!validateAccountingCommitInvariants({ lines: x.r.lines, chart: x.r.chart || DEFAULT_GL_CHART, invDer: null, settings: st.settings }).ok) {
      return fail("Partial payment + refund: invariants");
    }
    pass("Partial payment + refund path");
  })();

  /* ── 4: Strict period lock (override ids for audit) ── */
  (function () {
    var oldRows = [{ id: "sale1", date: "2020-01-01", total: 100 }];
    var newRows = [{ id: "sale1", date: "2020-01-01", total: 999 }];
    var ids = collectStrictPeriodLockOverrideIds("tc3_sales", newRows, oldRows, { lockedUntilDate: "2025-01-01", strictPeriodLock: true });
    if (!ids || ids.indexOf("sale1") < 0) return fail("Strict period lock: override id expected");
    pass("Strict period lock enforcement (audit layer)");
  })();

  /* ── 5: Sync merge + imbalance rejection ── */
  (function () {
    var loc = [
      { id: "a", entryGroupId: "x", transactionId: "x", accountId: GL.CASH, debit: 10, credit: 0, date: "2026-01-01" },
      { id: "b", entryGroupId: "x", transactionId: "x", accountId: GL.SALES, debit: 0, credit: 10, date: "2026-01-01" },
    ];
    var rem = loc.slice();
    var mer = mergeJournalLinesByTransactionId(loc, rem, function () {});
    if (!validateJournalBalanced(mer.lines).ok) return fail("Sync merge: balanced merge");
    var bad = mer.lines.concat([{ id: "z", entryGroupId: "bad", transactionId: "bad", accountId: GL.CASH, debit: 0, credit: 999, date: "2026-01-01" }]);
    if (validateJournalBalanced(bad).ok) return fail("Sync merge: imbalance must be rejected");
    pass("Sync merge (balanced); imbalance rejected");
  })();

  /* ── 6: Journal rebuild idempotency ── */
  (function () {
    var st = baseState();
    var r1 = rebuild(st, Smock).r;
    var r2 = rebuild(st, Smock).r;
    if (JSON.stringify(r1.lines) !== JSON.stringify(r2.lines)) return fail("Rebuild idempotency");
    pass("Journal rebuild idempotency");
  })();

  /* ── 6b: mergeRebuildWithImmutableHistory — correction tip idempotent ── */
  (function () {
    var mk = function () { return "ln_" + Math.random().toString(36).slice(2, 9); };
    var base = [
      { id: "a1", transactionId: "T1", entryGroupId: "T1", accountId: GL.CASH, debit: 100, credit: 0, date: "2026-01-01", isPosted: true, memo: "pay" },
      { id: "a2", transactionId: "T1", entryGroupId: "T1", accountId: GL.SALES, debit: 0, credit: 100, date: "2026-01-01", isPosted: true, memo: "rev" },
    ];
    var rebuiltChanged = [
      { id: "b1", transactionId: "T1", entryGroupId: "T1", accountId: GL.CASH, debit: 120, credit: 0, date: "2026-01-01", memo: "pay" },
      { id: "b2", transactionId: "T1", entryGroupId: "T1", accountId: GL.SALES, debit: 0, credit: 120, date: "2026-01-01", memo: "rev" },
    ];
    var m1 = mergeRebuildWithImmutableHistory(base, rebuiltChanged, mk);
    if (!validateJournalBalanced(m1).ok) return fail("Merge correction: first merge unbalanced", validateJournalBalanced(m1));
    var corrCount1 = m1.filter(function (ln) { return ln.correctsTransactionId === "T1"; }).length;
    if (corrCount1 < 2) return fail("Merge correction: expected correction lines", corrCount1);
    var m2 = mergeRebuildWithImmutableHistory(m1, rebuiltChanged, mk);
    var corrCount2 = m2.filter(function (ln) { return ln.correctsTransactionId === "T1"; }).length;
    if (corrCount2 !== corrCount1) return fail("Merge correction: second merge re-corrected", { corrCount1: corrCount1, corrCount2: corrCount2 });
    if (m2.length !== m1.length) return fail("Merge correction: second merge changed line count", { a: m1.length, b: m2.length });
    if (!validateJournalBalanced(m2).ok) return fail("Merge correction: second merge unbalanced");
    pass("Journal merge correction idempotency");
  })();

  /* ── 7: Commit invariant failures block persist (same gates as App commitGlJournalPersist) ── */
  (function () {
    var settings = { glArApNegativeTolerance: 50, glArApHardBlockAt: 1000000 };
    var imbalance = [
      { id: "1", entryGroupId: "g", transactionId: "g", accountId: GL.CASH, debit: 10, credit: 0, date: "2026-01-01" },
      { id: "2", entryGroupId: "g", transactionId: "g", accountId: GL.SALES, debit: 0, credit: 5, date: "2026-01-01" },
    ];
    var vf = validateJournalBalanced(imbalance);
    if (vf.ok) return fail("Commit block: expected imbalanced sample to fail balance check");
    var invI = validateAccountingCommitInvariants({ lines: imbalance, chart: DEFAULT_GL_CHART, invDer: null, settings: settings, source: "test" });
    if (invI.ok) return fail("Commit block: imbalanced journal must fail invariants");
    var meta = {};
    DEFAULT_GL_CHART.forEach(function (a) {
      meta[a.id] = a;
    });
    var badAr = [
      { accountId: GL.AR, debit: 0, credit: 2000000, referenceType: "", referenceId: "", memo: "" },
      { accountId: GL.CASH, debit: 2000000, credit: 0, referenceType: "", referenceId: "", memo: "" },
    ];
    for (var i = 0; i < badAr.length; i++) {
      badAr[i].id = "b" + i;
      badAr[i].entryGroupId = "g2";
      badAr[i].transactionId = "g2";
      badAr[i].date = "2026-01-01";
    }
    if (!validateJournalBalanced(badAr).ok) return fail("Commit block: AR policy sample should be balanced");
    var invA = validateAccountingCommitInvariants({ lines: badAr, chart: DEFAULT_GL_CHART, invDer: null, settings: settings, source: "test" });
    if (invA.ok) return fail("Commit block: AR policy violation must fail invariants");
    pass("Commit invariant failures would block save (imbalance + AR policy)");
  })();

  /* ── AR/AP policy smoke (tolerance vs hard block) ── */
  (function () {
    var meta = {};
    DEFAULT_GL_CHART.forEach(function (a) {
      meta[a.id] = a;
    });
    var settings = { glArApNegativeTolerance: 50, glArApHardBlockAt: 1000000 };
    var linesSmall = [
      { accountId: GL.AR, debit: 0, credit: 30, referenceType: "sale", referenceId: "x", memo: "credit" },
      { accountId: GL.CASH, debit: 30, credit: 0, referenceType: "sale", referenceId: "x", memo: "x" },
    ];
    var ev = evaluateArApPolicy({ lines: linesSmall, meta: meta, settings: settings });
    if (!ev.ar.ok) return fail("AR small negative within tolerance", ev.ar);
    var linesHuge = [
      { accountId: GL.AR, debit: 0, credit: 2000000, referenceType: "x", referenceId: "y", memo: "huge" },
      { accountId: GL.CASH, debit: 2000000, credit: 0, referenceType: "x", referenceId: "y", memo: "x" },
    ];
    var ev2 = evaluateArApPolicy({ lines: linesHuge, meta: meta, settings: settings });
    if (ev2.ar.ok) return fail("AR huge negative should fail policy");
    pass("AR/AP policy — tolerance vs hard block");
  })();

  /* ── Minimal balanced journal ── */
  (function () {
    var lines = [
      { id: "1", entryGroupId: "g1", transactionId: "g1", accountId: GL.CASH, debit: 100, credit: 0, date: "2026-01-01" },
      { id: "2", entryGroupId: "g1", transactionId: "g1", accountId: GL.SALES, debit: 0, credit: 100, date: "2026-01-01" },
    ];
    if (!validateJournalBalanced(lines).ok) return fail("Minimal balanced journal");
    if (!validateAccountingCommitInvariants({ lines: lines, chart: DEFAULT_GL_CHART, invDer: null, settings: { glArApNegativeTolerance: 50, glArApHardBlockAt: 1000000 } }).ok) {
      return fail("Minimal commit invariants");
    }
    pass("Minimal balanced journal + invariants");
  })();

  /* ── 8: Multi-line purchase rounding + inventory reconciliation ── */
  (function () {
    var st = baseState();
    var pid = "prod_rnd_ml";
    st.products = [{ id: pid, productId: "9001", name: "ML", stock: 0, cost: 0, sellPrice: 10 }];
    st.purchases = [{
      id: "pur_ml",
      date: "2026-04-01",
      total: 100,
      totalTax: 0,
      items: [
        { id: pid, productId: pid, inputQty: 1, qty: 1, cost: 33.333 },
        { id: pid, productId: pid, inputQty: 1, qty: 1, cost: 33.333 },
        { id: pid, productId: pid, inputQty: 1, qty: 1, cost: 33.334 },
      ],
      paymentHistory: [],
    }];
    var x = rebuild(st, Smock);
    if (!validateJournalBalanced(x.r.lines).ok) return fail("Multi-line purchase: journal balance");
    var rec = reconcileInventoryToLedger(x.r.lines, x.invDer, DEFAULT_GL_CHART);
    if (!rec.ok) return fail("Multi-line purchase: INV vs GL", rec);
    pass("Multi-line purchase rounding (balanced + INV recon)");
  })();

  /* ── 9: Fractional WAC reconciliation ── */
  (function () {
    var st = baseState();
    var pid = "prod_wac_frac";
    st.products = [{ id: pid, productId: "9002", name: "WF", stock: 0, cost: 0, sellPrice: 10 }];
    st.purchases = [
      { id: "pWa", date: "2026-05-01", total: 20, totalTax: 0, items: [{ id: pid, productId: pid, inputQty: 3, qty: 3, cost: 6.6667 }], paymentHistory: [] },
      { id: "pWb", date: "2026-05-02", total: 10, totalTax: 0, items: [{ id: pid, productId: pid, inputQty: 2, qty: 2, cost: 5.5555 }], paymentHistory: [] },
    ];
    var x = rebuild(st, Smock);
    var rec = reconcileInventoryToLedger(x.r.lines, x.invDer, DEFAULT_GL_CHART);
    if (!rec.ok && Math.abs(rec.difference) > 0.05) return fail("Fractional WAC: INV vs GL gap", rec);
    pass("Fractional WAC inventory vs GL");
  })();

  /* ── 10: Reconciliation drill-down grouping ── */
  (function () {
    var lines = [
      { id: "l1", accountId: GL.INV, debit: 50, credit: 0, date: "2026-01-01", referenceType: "purchase", referenceId: "p1", memo: "" },
      { id: "l2", accountId: GL.INV, debit: 0, credit: 30, date: "2026-01-02", referenceType: "sale_cogs", referenceId: "s1", memo: "" },
      { id: "l3", accountId: GL.INV, debit: 5, credit: 0, date: "2026-01-03", referenceType: "sales_return_cogs", referenceId: "r1", memo: "" },
    ];
    var x = explainInventoryDifference(lines, DEFAULT_GL_CHART, {});
    if (!x.buckets.purchases.rows.length) return fail("Recon explain: purchases bucket");
    if (!x.buckets.sales_cogs.rows.length) return fail("Recon explain: COGS bucket");
    if (!x.topContributors.length) return fail("Recon explain: top contributors");
    pass("Inventory recon explain (grouped buckets)");
  })();

  /* ── 11: Replay window integrity ── */
  (function () {
    var st = baseState();
    var pid = "prod_replay_t";
    st.products = [{ id: pid, productId: "r1", name: "R", stock: 0, cost: 0, sellPrice: 10 }];
    st.purchases = [{ id: "pu1", date: "2026-06-01", total: 100, totalTax: 0, items: [{ id: pid, productId: pid, qty: 10, cost: 10 }], paymentHistory: [] }];
    var Smock = makeSmock();
    var invDer = deriveInventoryEconomics(st, Smock);
    var w = buildInventoryReplayWindow(invDer, pid, "2026-06-01", "2026-06-30");
    if (w.openingQty !== 0) return fail("Replay: opening qty");
    if (!(w.rows && w.rows.length >= 1)) return fail("Replay: movement rows");
    if (typeof w.closingQty !== "number") return fail("Replay: closing qty");
    pass("Inventory replay window output");
  })();

  /* ── 12: Period lock date helper ── */
  (function () {
    if (!isLockedThroughDate("2026-01-15", "2026-01-20")) return fail("Period lock: should lock on or before end date");
    if (isLockedThroughDate("2026-01-21", "2026-01-20")) return fail("Period lock: should not lock after end date");
    pass("Period lock inclusive boundary");
  })();

  /* ── 13: Reports-style rounding consistency ── */
  (function () {
    var a = 10.004 + 10.004 + 10.005;
    if (round2(a) !== 30.01) return fail("Rounding consistency: triple line sum");
    pass("Rounding consistency (round2 aggregate)");
  })();

  /* ── 14: Aggregate A vs B rounding drift helper ── */
  (function () {
    var cmp = compareRoundSumMethods([1.004, 1.004, 1.004]);
    if (Math.abs(cmp.drift) < 0.005) return fail("Rounding drift helper: expected non-zero drift", cmp);
    pass("Aggregate rounding A vs B detection");
  })();

  /* ── 15: Inventory recon time travel (multi-day) ── */
  (function () {
    var st = baseState();
    var pid = "prod_tt_s";
    st.products = [{ id: pid, productId: "9001", name: "TT", stock: 0, cost: 10, sellPrice: 11 }];
    st.purchases = [{ id: "pur_tt_s", date: "2026-02-01", total: 50, totalTax: 0, items: [{ id: pid, productId: pid, qty: 5, cost: 10 }], paymentHistory: [] }];
    var Smock = makeSmock();
    var x = rebuild(st, Smock);
    var series = buildInventoryReconTimeSeries(st, Smock, x.r.lines, DEFAULT_GL_CHART, "2026-02-01", "2026-02-07");
    if (series.length !== 7) return fail("Time travel: expected 7 days", series.length);
    if (series[0].date !== "2026-02-01") return fail("Time travel: start date");
    pass("Inventory recon time travel (7-day series)");
  })();

  /* ── 16: Snapshot TB diff detection ── */
  (function () {
    var leg = diffTrialBalanceSnapshotVsLive(DEFAULT_GL_CHART, {}, { rows: [] }, 10);
    if (!leg.legacy) return fail("Snapshot diff: legacy snapshot expected");
    var snap = { trialBalanceAccounts: { "1000": { debit: 10, credit: 0, code: "1000", name: "Cash" } } };
    var live = { rows: [{ accountId: "1000", debit: 15, credit: 0, code: "1000", name: "Cash", type: "asset" }] };
    var d = diffTrialBalanceSnapshotVsLive(DEFAULT_GL_CHART, snap, live, 10);
    if (!d.rows || d.rows.length !== 1) return fail("Snapshot diff: one changed row", d);
    pass("Snapshot trial balance diff (non-legacy)");
  })();

  /* ── 17: Large replay window timing sanity ── */
  (function () {
    var st = baseState();
    var pid = "prod_big_r";
    st.products = [{ id: pid, productId: "b1", name: "B", stock: 0, cost: 1, sellPrice: 2 }];
    var i;
    var sales = [];
    for (i = 0; i < 120; i++) {
      sales.push({ id: "s" + i, date: "2026-03-01", items: [{ id: pid, qty: 1, cost: 1, price: 2 }], total: 2, paid: 2, paymentHistory: [] });
    }
    st.sales = sales;
    var Smock = makeSmock();
    var invDer = deriveInventoryEconomics(st, Smock);
    var t0 = Date.now();
    var w = buildInventoryReplayWindow(invDer, pid, "2026-03-01", "2026-03-31", {});
    var ms = Date.now() - t0;
    if (!(w.rows && w.rows.length >= 100)) return fail("Large replay: expected many rows", w.rows && w.rows.length);
    if (ms > 60000) return fail("Large replay: unreasonably slow", ms);
    pass("Large dataset replay window (sanity)");
  })();

  /* ── 18: Raw material kitchen GL — balanced + inventory reconcile ── */
  (function () {
    var st = baseState();
    var pid = "rm_kitch_1";
    st.products = [{ id: pid, name: "Flour", type: "raw_material", stock: 100, cost: 2, sellPrice: 10 }];
    st.purchases = [{ id: "pur_k", date: "2026-04-01", total: 200, totalTax: 0, items: [{ id: pid, productId: pid, qty: 100, cost: 2 }], paymentHistory: [] }];
    st.rawMaterialUsages = [{ id: "u_k1", productId: pid, date: "2026-04-02", qty: 5, unit: "Kg", qtyBase: 5 }];
    var Smock = makeSmock();
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Kitchen GL: rebuild validate", x.r.validate);
    var invCheck = validateAccountingCommitInvariants({
      lines: x.r.lines,
      chart: DEFAULT_GL_CHART,
      invDer: x.invDer,
      settings: st.settings,
    });
    if (!invCheck.ok) return fail("Kitchen GL: commit invariants", invCheck.errors);
    var kt = x.r.lines.filter(function (ln) {
      return ln.referenceType === "raw_material_usage" && ln.referenceId === "raw_usage_2026-04-02";
    });
    if (kt.length !== 2) return fail("Kitchen GL: expected 2 lines for one day", kt.length);
    var replay = sumRawMaterialKitchenCostInRange(st, "2026-04-02", "2026-04-02");
    var dr = 0;
    kt.forEach(function (ln) {
      if (ln.accountId === GL.COGS_KITCHEN) dr += round2(ln.debit || 0);
    });
    if (round2(dr) !== replay) return fail("Kitchen GL: replay vs journal Dr", replay, dr);
    pass("Kitchen raw material GL + inventory reconcile");
  })();

  /* ── 19: Same calendar day aggregates (one journal ref) — no double post ── */
  (function () {
    var st = baseState();
    var pid = "rm_k2";
    st.products = [{ id: pid, name: "Sugar", type: "raw_material", stock: 100, cost: 3, sellPrice: 10 }];
    st.purchases = [{ id: "pur_k2", date: "2026-05-01", total: 300, totalTax: 0, items: [{ id: pid, productId: pid, qty: 100, cost: 3 }], paymentHistory: [] }];
    st.rawMaterialUsages = [
      { id: "ua", productId: pid, date: "2026-05-03", qty: 2, unit: "Kg", qtyBase: 2 },
      { id: "ub", productId: pid, date: "2026-05-03", qty: 1, unit: "Kg", qtyBase: 1 },
    ];
    var x = rebuild(st, makeSmock());
    if (!x.r.validate.ok) return fail("Kitchen aggregate: validate", x.r.validate);
    var groups = {};
    x.r.lines.forEach(function (ln) {
      if (ln.referenceType !== "raw_material_usage") return;
      var g = ln.transactionId || ln.entryGroupId || "";
      groups[g] = (groups[g] || 0) + 1;
    });
    var txnIds = Object.keys(groups).filter(function (k) { return groups[k] === 2; });
    if (txnIds.length !== 1) return fail("Kitchen aggregate: expected one txn group", groups);
    pass("Kitchen same-day aggregate (single posting group)");
  })();

  /* ── 20: Edit usage qty — deterministic ref, amount tracks replay ── */
  (function () {
    var st = baseState();
    var pid = "rm_k3";
    st.products = [{ id: pid, name: "Oil", type: "raw_material", stock: 50, cost: 4, sellPrice: 12 }];
    st.purchases = [{ id: "pur_k3", date: "2026-06-01", total: 200, totalTax: 0, items: [{ id: pid, productId: pid, qty: 50, cost: 4 }], paymentHistory: [] }];
    st.rawMaterialUsages = [{ id: "ux", productId: pid, date: "2026-06-10", qty: 10, unit: "L", qtyBase: 10 }];
    var x1 = rebuild(st, makeSmock());
    st.rawMaterialUsages = [{ id: "ux", productId: pid, date: "2026-06-10", qty: 4, unit: "L", qtyBase: 4 }];
    var x2 = rebuild(st, makeSmock());
    var d1 = x1.r.lines.filter(function (ln) {
      return ln.accountId === GL.COGS_KITCHEN && ln.date === "2026-06-10";
    }).reduce(function (a, ln) { return a + round2(ln.debit || 0) - round2(ln.credit || 0); }, 0);
    var d2 = x2.r.lines.filter(function (ln) {
      return ln.accountId === GL.COGS_KITCHEN && ln.date === "2026-06-10";
    }).reduce(function (a, ln) { return a + round2(ln.debit || 0) - round2(ln.credit || 0); }, 0);
    if (d1 === d2) return fail("Kitchen edit: expected different COGS amounts", d1, d2);
    var exp2 = sumRawMaterialKitchenCostInRange(st, "2026-06-10", "2026-06-10");
    if (round2(d2) !== exp2) return fail("Kitchen edit: GL vs replay", exp2, d2);
    pass("Kitchen usage edit updates journal amount");
  })();

  /* ── 21: Range replay total vs GL kitchen account ── */
  (function () {
    var st = baseState();
    var pid = "rm_k4";
    st.products = [{ id: pid, name: "Rice", type: "raw_material", stock: 200, cost: 1, sellPrice: 5 }];
    st.purchases = [{ id: "pur_k4", date: "2026-07-01", total: 200, totalTax: 0, items: [{ id: pid, productId: pid, qty: 200, cost: 1 }], paymentHistory: [] }];
    st.rawMaterialUsages = [
      { id: "r1", productId: pid, date: "2026-07-05", qty: 10, unit: "Kg", qtyBase: 10 },
      { id: "r2", productId: pid, date: "2026-07-08", qty: 5, unit: "Kg", qtyBase: 5 },
    ];
    var x = rebuild(st, makeSmock());
    var replay = sumRawMaterialKitchenCostInRange(st, "2026-07-01", "2026-07-31");
    var glK = 0;
    x.r.lines.forEach(function (ln) {
      if (ln.accountId !== GL.COGS_KITCHEN) return;
      if (String(ln.date || "") < "2026-07-01" || String(ln.date || "") > "2026-07-31") return;
      glK = round2(glK + round2(ln.debit || 0) - round2(ln.credit || 0));
    });
    if (replay !== glK) return fail("Kitchen P&L vs GL range", replay, glK);
    pass("Kitchen replay equals GL in range");
  })();

  /* ── 22: Period lock override ids include raw material usage edits ── */
  (function () {
    var pid = "rm_u";
    var oldU = [{ id: "ru1", date: "2026-01-05", productId: pid, qtyBase: 1 }];
    var newU = [{ id: "ru1", date: "2026-01-05", productId: pid, qtyBase: 2 }];
    var ids = collectStrictPeriodLockOverrideIds("tc3_raw_material_usage", newU, oldU, {
      lockedUntilDate: "2026-01-31",
      strictPeriodLock: true,
    });
    if (!ids.length) return fail("Period lock: expected override id for RM usage edit", ids);
    pass("Period lock override detection (raw material usage)");
  })();

  /* ── 23: Monthly kitchen aggregation matches range replay total ── */
  (function () {
    var st = baseState();
    var pid = "rm_month_agg";
    st.products = [{ id: pid, type: "raw_material", name: "M", stock: 100, cost: 2, sellPrice: 5 }];
    st.purchases = [{ id: "pma", date: "2026-11-01", total: 200, totalTax: 0, items: [{ id: pid, qty: 100, cost: 2 }], paymentHistory: [] }];
    st.rawMaterialUsages = [
      { id: "u1", productId: pid, date: "2026-11-05", qty: 3, unit: "Kg", qtyBase: 3 },
      { id: "u2", productId: pid, date: "2026-12-08", qty: 4, unit: "Kg", qtyBase: 4 },
    ];
    var inv = deriveInventoryEconomics(st, makeSmock());
    var byM = aggregateKitchenCostByMonthInRange(st, "2026-11-01", "2026-12-31", inv);
    var t11 = sumRawMaterialKitchenCostInRange(st, "2026-11-01", "2026-11-30", inv);
    var t12 = sumRawMaterialKitchenCostInRange(st, "2026-12-01", "2026-12-31", inv);
    if (round2((byM["2026-11"] || 0) + (byM["2026-12"] || 0)) !== sumRawMaterialKitchenCostInRange(st, "2026-11-01", "2026-12-31", inv)) {
      return fail("Monthly kitchen agg: sum of months vs range");
    }
    if (round2(byM["2026-11"] || 0) !== t11 || round2(byM["2026-12"] || 0) !== t12) {
      return fail("Monthly kitchen agg: per-month mismatch", byM, t11, t12);
    }
    pass("Monthly kitchen aggregation (replay by month)");
  })();

  /* ── 24: Balance sheet equation includes cumulative P&L (display) — matches golden gap closed by NI ── */
  (function () {
    var st = baseState();
    st.products = [{ id: "gp1", name: "Golden", stock: 0, cost: 5, sellPrice: 20 }];
    st.purchases = [
      {
        id: "gpur",
        date: "2026-01-01",
        total: 50,
        totalTax: 0,
        items: [{ id: "gp1", productId: "gp1", qty: 10, cost: 5 }],
        paymentHistory: [{ date: "2026-01-01", amount: 50, cashMethod: "Cash" }],
      },
    ];
    st.sales = [
      {
        id: "gsale",
        date: "2026-01-02",
        invoiceNo: "GINV",
        total: 80,
        paid: 80,
        items: [{ id: "gp1", productId: "gp1", qty: 2, cost: 5, lineTotal: 80 }],
        paymentHistory: [{ amount: 80, cashMethod: "Cash", note: "" }],
      },
    ];
    var x = rebuild(st, makeSmock());
    var bs = balanceSheetFromLedger(x.r.lines, DEFAULT_GL_CHART, null);
    if (bs.balanced) return fail("BS book-only: expected gap before NI", bs);
    if (!bs.balancedWithEarnings) return fail("BS with earnings: should balance", bs);
    if (Math.abs(bs.differenceWithEarnings) > 0.02) return fail("BS with earnings: diff", bs.differenceWithEarnings);
    if (Math.abs(bs.currentEarnings - 70) > 0.02) return fail("BS currentEarnings vs P&L net", bs.currentEarnings);
    pass("Balance sheet balancedWithEarnings (cumulative NI)");
  })();

  /* -- 25: Opening stock participates in replay so INV vs GL reconciliation stays aligned -- */
  (function () {
    var st = baseState();
    var pid = "ob_rec_1";
    st.products = [{ id: pid, productId: "ob1", name: "OB Product", barcode: "OBCODE1", stock: 10, cost: 100, sellPrice: 150 }];
    st.openBal = {
      completed: true,
      date: "2026-01-01",
      cash: 0,
      bank: 0,
      receivables: [],
      payables: [],
      stock: [{ productId: pid, name: "OB Product", barcode: "OBCODE1", qty: 10, cost: 100 }],
      assets: [],
      capital: 1000,
    };
    var Sm = makeSmock({ tc3_openBal: st.openBal });
    var x = rebuild(st, Sm);
    var rec = reconcileInventoryToLedger(x.r.lines, x.invDer, DEFAULT_GL_CHART);
    if (!rec.ok) return fail("Opening stock reconcile: INV vs GL", rec);
    if (Math.abs(round2(rec.glInventoryBalance) - 1000) > 0.02) return fail("Opening stock reconcile: expected GL INV 1000", rec);
    if (Math.abs(round2(rec.physicalValue) - 1000) > 0.02) return fail("Opening stock reconcile: expected physical 1000", rec);
    pass("Opening stock included in inventory replay reconciliation");
  })();

  function acctBal(lines, acctId) {
    var meta = DEFAULT_GL_CHART.find(function (a) { return a.id === acctId; }) || { normal: "debit" };
    var s = sumAccount(lines, acctId);
    return signedBalanceForAccount(meta, s.debit, s.credit);
  }

  /* ── Tax: exclusive VAT — full sales return reverses output tax ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "exclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 10, enabled: true }],
    });
    var pid = "prod_tax_sr";
    st.products = [{ id: pid, name: "Taxed", stock: 10, cost: 50, sellPrice: 100 }];
    st.purchases = [{
      id: "pur_tax_sr", date: "2026-02-01", total: 500, totalTax: 0,
      items: [{ id: pid, qty: 10, cost: 50 }],
      paymentHistory: [],
    }];
    st.sales = [{
      id: "sale_tax_sr", date: "2026-02-05", invoiceNo: "INV-TAX-1",
      total: 220, totalTax: 20, taxMode: "exclusive",
      selectedTaxes: [{ name: "VAT", rate: 10, amount: 20 }],
      paid: 220,
      items: [{ id: pid, qty: 2, price: 100, cost: 50 }],
      paymentHistory: [{ id: "ph1", date: "2026-02-05", amount: 220, cashMethod: "Cash" }],
    }];
    st.salesReturns = [{
      id: "sr_tax_1", invoiceId: "sale_tax_sr", date: "2026-02-06",
      amount: 200, returnTax: 20, qty: 2, cost: 50, refundAmount: 220, refundMethod: "Cash",
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Taxed sales return: rebuild validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.VAT_PAY)) > 0.02) return fail("Taxed sales return: VAT_PAY should be 0", acctBal(x.r.lines, GL.VAT_PAY));
    if (Math.abs(acctBal(x.r.lines, GL.SRET) - 200) > 0.02) return fail("Taxed sales return: SRET net", acctBal(x.r.lines, GL.SRET));
    pass("Taxed sales return — output VAT reversed");
  })();

  /* ── Tax: exclusive VAT — partial sales return ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "exclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 10, enabled: true }],
    });
    var pid = "prod_tax_sr_p";
    st.products = [{ id: pid, name: "Taxed", stock: 10, cost: 50, sellPrice: 100 }];
    st.purchases = [{
      id: "pur_tax_sr_p", date: "2026-02-01", total: 500, totalTax: 0,
      items: [{ id: pid, qty: 10, cost: 50 }],
      paymentHistory: [],
    }];
    st.sales = [{
      id: "sale_tax_sr_p", date: "2026-02-05", invoiceNo: "INV-TAX-2",
      total: 220, totalTax: 20, taxMode: "exclusive",
      selectedTaxes: [{ name: "VAT", rate: 10, amount: 20 }],
      paid: 0,
      items: [{ id: pid, qty: 2, price: 100, cost: 50 }],
      paymentHistory: [],
    }];
    st.salesReturns = [{
      id: "sr_tax_p", invoiceId: "sale_tax_sr_p", date: "2026-02-06",
      amount: 100, returnTax: 10, qty: 1, cost: 50, refundAmount: 0,
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Taxed partial sales return: validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.VAT_PAY) - 10) > 0.02) return fail("Taxed partial sales return: VAT_PAY remainder", acctBal(x.r.lines, GL.VAT_PAY));
    pass("Taxed partial sales return — output VAT pro-rata");
  })();

  /* ── Tax: purchase return reverses input VAT and AP gross ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "exclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 10, enabled: true }],
    });
    var pid = "prod_tax_pr";
    st.products = [{ id: pid, name: "Taxed", stock: 10, cost: 50, sellPrice: 100 }];
    st.purchases = [{
      id: "pur_tax_pr", date: "2026-02-01", invoiceNo: "P-TAX-1",
      total: 110, totalTax: 10, taxMode: "exclusive",
      items: [{ id: pid, qty: 2, cost: 50, lineStockValue: 100 }],
      paidAmount: 0,
      paymentHistory: [
        { id: "ph_p1", date: "2026-02-01", amount: 110, cashMethod: "Bank" },
        { id: "ph_p1r", date: "2026-02-08", amount: -110, cashMethod: "Bank", type: "refund", note: "Purchase return refund/adjustment" },
      ],
    }];
    st.purchaseReturns = [{
      id: "pr_tax_1", purchaseId: "pur_tax_pr", date: "2026-02-08",
      qty: 2, cost: 50, amount: 100, returnTax: 10, returnGross: 110,
      isRefund: true, refundAmount: 110, refundMethod: "Bank",
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Taxed purchase return: validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.VAT_REC)) > 0.02) return fail("Taxed purchase return: VAT_REC should be 0", acctBal(x.r.lines, GL.VAT_REC));
    if (Math.abs(acctBal(x.r.lines, GL.AP)) > 0.02) return fail("Taxed purchase return: AP should be 0", acctBal(x.r.lines, GL.AP));
    pass("Taxed purchase return — input VAT and AP reversed");
  })();

  /* ── Tax: partial purchase return ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "exclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 10, enabled: true }],
    });
    var pid = "prod_tax_pr_p";
    st.products = [{ id: pid, name: "Taxed", stock: 10, cost: 50, sellPrice: 100 }];
    st.purchases = [{
      id: "pur_tax_pr_p", date: "2026-02-01", invoiceNo: "P-TAX-2",
      total: 110, totalTax: 10,
      items: [{ id: pid, qty: 2, cost: 50, lineStockValue: 100 }],
      paidAmount: 0,
      paymentHistory: [],
    }];
    st.purchaseReturns = [{
      id: "pr_tax_p", purchaseId: "pur_tax_pr_p", date: "2026-02-08",
      qty: 1, cost: 50, amount: 50, returnTax: 5, returnGross: 55,
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Taxed partial purchase return: validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.VAT_REC) - 5) > 0.02) return fail("Taxed partial purchase return: VAT_REC", acctBal(x.r.lines, GL.VAT_REC));
    if (Math.abs(acctBal(x.r.lines, GL.AP) - 55) > 0.02) return fail("Taxed partial purchase return: AP", acctBal(x.r.lines, GL.AP));
    pass("Taxed partial purchase return — input VAT pro-rata");
  })();

  /* ── Tax: inclusive VAT — full sales return (price is tax-inclusive) ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "inclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 10, enabled: true }],
    });
    var pid = "prod_tax_inc";
    st.products = [{ id: pid, name: "TaxedInc", stock: 10, cost: 50, sellPrice: 110 }];
    st.purchases = [{
      id: "pur_tax_inc", date: "2026-03-01", total: 500, totalTax: 0,
      items: [{ id: pid, qty: 10, cost: 50 }],
      paymentHistory: [],
    }];
    st.sales = [{
      id: "sale_tax_inc", date: "2026-03-05", invoiceNo: "INV-INC-1",
      total: 110, totalTax: 10, taxMode: "inclusive",
      selectedTaxes: [{ name: "VAT", rate: 10, amount: 10 }],
      paid: 110,
      items: [{ id: pid, qty: 1, price: 110, cost: 50 }],
      paymentHistory: [{ id: "ph1", date: "2026-03-05", amount: 110, cashMethod: "Cash" }],
    }];
    st.salesReturns = [{
      id: "sr_inc_1", invoiceId: "sale_tax_inc", date: "2026-03-06",
      amount: 100, returnTax: 10, returnGross: 110, qty: 1, cost: 50, refundAmount: 110, refundMethod: "Cash",
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Inclusive sales return: validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.VAT_PAY)) > 0.02) return fail("Inclusive sales return: VAT_PAY", acctBal(x.r.lines, GL.VAT_PAY));
    if (Math.abs(acctBal(x.r.lines, GL.SRET) - 100) > 0.02) return fail("Inclusive sales return: SRET net", acctBal(x.r.lines, GL.SRET));
    var pl = profitAndLossFromLedger(x.r.lines, DEFAULT_GL_CHART, null, null);
    if (Math.abs(pl.net) > 0.02) return fail("Inclusive sales return: P&L net should be 0", pl);
    pass("Inclusive taxed sales return — net + VAT reversed");
  })();

  /* ── Tax: inclusive VAT — legacy row (gross in amount, no returnGross) ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "inclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 10, enabled: true }],
    });
    var pid = "prod_tax_inc_l";
    st.products = [{ id: pid, name: "TaxedInc", stock: 10, cost: 50, sellPrice: 110 }];
    st.purchases = [{
      id: "pur_tax_inc_l", date: "2026-03-01", total: 500, totalTax: 0,
      items: [{ id: pid, qty: 10, cost: 50 }],
      paymentHistory: [],
    }];
    st.sales = [{
      id: "sale_tax_inc_l", date: "2026-03-05", invoiceNo: "INV-INC-2",
      total: 110, totalTax: 10, taxMode: "inclusive",
      selectedTaxes: [{ name: "VAT", rate: 10, amount: 10 }],
      paid: 110,
      items: [{ id: pid, qty: 1, price: 110, cost: 50 }],
      paymentHistory: [{ id: "ph1", date: "2026-03-05", amount: 110, cashMethod: "Cash" }],
    }];
    st.salesReturns = [{
      id: "sr_inc_l", invoiceId: "sale_tax_inc_l", date: "2026-03-06",
      amount: 110, returnTax: 10, qty: 1, cost: 50, refundAmount: 110, refundMethod: "Cash",
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Inclusive legacy sales return: validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.VAT_PAY)) > 0.02) return fail("Inclusive legacy sales return: VAT_PAY", acctBal(x.r.lines, GL.VAT_PAY));
    if (Math.abs(acctBal(x.r.lines, GL.SRET) - 100) > 0.02) return fail("Inclusive legacy sales return: SRET", acctBal(x.r.lines, GL.SRET));
    pass("Inclusive legacy sales return — gross amount normalized on rebuild");
  })();

  /* ── Tax: inclusive purchase — net inventory + input VAT (no PUR_VAR double-count) ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "inclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 10, enabled: true }],
    });
    var pid = "prod_pur_inc";
    st.products = [{ id: pid, name: "PurInc", stock: 0, cost: 0 }];
    st.purchases = [{
      id: "pur_inc_gl", date: "2026-04-01", invoiceNo: "P-INC-1",
      total: 110, totalTax: 10, taxMode: "inclusive",
      items: [{ id: pid, qty: 10, cost: 11 }],
      paymentHistory: [],
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Inclusive purchase: validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.INV) - 100) > 0.02) return fail("Inclusive purchase: INV net", acctBal(x.r.lines, GL.INV));
    if (Math.abs(acctBal(x.r.lines, GL.VAT_REC) - 10) > 0.02) return fail("Inclusive purchase: VAT_REC", acctBal(x.r.lines, GL.VAT_REC));
    if (Math.abs(acctBal(x.r.lines, GL.AP) - 110) > 0.02) return fail("Inclusive purchase: AP", acctBal(x.r.lines, GL.AP));
    if (Math.abs(acctBal(x.r.lines, GL.PUR_VAR)) > 0.02) return fail("Inclusive purchase: PUR_VAR should be 0", acctBal(x.r.lines, GL.PUR_VAR));
    pass("Inclusive purchase — VAT extracted from inventory asset");
  })();

  /* ── Tax: inclusive purchase return — gross cost must not get VAT added on top ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "inclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 10, enabled: true }],
    });
    var pid = "prod_pur_inc_ret";
    st.products = [{ id: pid, name: "PurIncRet", stock: 10, cost: 10 }];
    st.purchases = [{
      id: "pur_inc_ret", date: "2026-04-01", invoiceNo: "P-INC-R",
      total: 110, totalTax: 10, taxMode: "inclusive",
      items: [{ id: pid, qty: 10, cost: 11 }],
      paidAmount: 0,
      paymentHistory: [],
    }];
    /* Full return of 1 unit: gross 11 → net INV 10, VAT_REC reverse 1, AP debit 11 */
    st.purchaseReturns = [{
      id: "pr_inc_1", purchaseId: "pur_inc_ret", date: "2026-04-08",
      qty: 1, cost: 11, amount: 11, returnTax: 1, returnGross: 11,
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Inclusive purchase return: validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.INV) - 90) > 0.02) return fail("Inclusive purchase return: INV net remaining", acctBal(x.r.lines, GL.INV));
    if (Math.abs(acctBal(x.r.lines, GL.VAT_REC) - 9) > 0.02) return fail("Inclusive purchase return: VAT_REC remaining", acctBal(x.r.lines, GL.VAT_REC));
    if (Math.abs(acctBal(x.r.lines, GL.AP) - 99) > 0.02) return fail("Inclusive purchase return: AP remaining", acctBal(x.r.lines, GL.AP));
    /* Also verify helper does not inflate when called with gross cost */
    var helper = computePurchaseReturnTax(st.purchases[0], 11, st.settings);
    if (Math.abs(helper.apGross - 11) > 0.02 || Math.abs(helper.stockCost - 10) > 0.02 || Math.abs(helper.taxReversal - 1) > 0.02) {
      return fail("Inclusive purchase return: computePurchaseReturnTax", helper);
    }
    pass("Inclusive purchase return — gross cost, net INV, no VAT-on-VAT");
  })();

  /* ── Tax: orphan sales returns are quarantined (no parent ⇒ no GL/inventory) ── */
  (function () {
    var st = baseState();
    st.settings = Object.assign({}, st.settings, {
      taxEnabled: true,
      taxMode: "inclusive",
      glVatPostingEnabled: true,
      selectedTaxes: [{ name: "VAT", rate: 15, enabled: true }],
    });
    var pid = "prod_orphan_ret";
    st.products = [{ id: pid, name: "OrphanRet", stock: 10, cost: 50 }];
    st.purchases = [{
      id: "pur_orphan", date: "2026-04-01", total: 500, totalTax: 0,
      items: [{ id: pid, qty: 10, cost: 50 }],
      paymentHistory: [],
    }];
    st.salesReturns = [{
      id: "sr_orphan", date: "2026-04-06",
      amount: 110, returnTax: 10, returnGross: 110,
      taxMode: "inclusive",
      selectedTaxes: [{ name: "VAT", rate: 10, amount: 10 }],
      qty: 1, cost: 50, refundAmount: 110, refundMethod: "Cash",
    }];
    var x = rebuild(st, Smock);
    if (!x.r.validate.ok) return fail("Orphan sales return: validate", x.r.validate);
    if (Math.abs(acctBal(x.r.lines, GL.SRET)) > 0.02) return fail("Orphan sales return: SRET must stay 0 (quarantined)", acctBal(x.r.lines, GL.SRET));
    var orphanLines = (x.r.lines || []).filter(function (l) {
      return l.referenceType === "sales_return" || l.referenceType === "sales_return_cogs";
    });
    if (orphanLines.length !== 0) return fail("Orphan sales return: expected no GL lines", orphanLines.length);
    pass("Orphan sales return — quarantined without active parent");
  })();

  /* ── Inventory: same-day events sort by isoDateTime (not array/_seq order) ── */
  (function () {
    var st = baseState();
    var pid = "prod_ts_sort";
    st.products = [{ id: pid, name: "TsSort", stock: 0, cost: 0, sellPrice: 250 }];
    st.settings = Object.assign({}, st.settings, { inventoryCostingMethod: "wac" });
    st.purchases = [
      {
        id: "p_late", date: "2026-05-01", createdAt: "2026-05-01T15:00:00.000Z",
        total: 200, items: [{ id: pid, qty: 1, cost: 200 }],
        paymentHistory: [],
      },
      {
        id: "p_early", date: "2026-05-01", createdAt: "2026-05-01T09:00:00.000Z",
        total: 100, items: [{ id: pid, qty: 1, cost: 100 }],
        paymentHistory: [],
      },
    ];
    st.sales = [{
      id: "s_after", date: "2026-05-01", createdAt: "2026-05-01T16:00:00.000Z",
      total: 250, items: [{ id: pid, qty: 1, price: 250, cost: 0 }],
      paymentHistory: [{ id: "ph1", date: "2026-05-01", amount: 250, cashMethod: "Cash" }],
    }];
    var inv = deriveInventoryEconomics(st, Smock);
    var cogs = inv.cogsBySaleId && inv.cogsBySaleId["s_after"];
    if (cogs == null || Math.abs(cogs - 150) > 0.02) {
      return fail("Same-day isoDateTime sort: WAC COGS", cogs);
    }
    pass("Same-day inventory events — chronological isoDateTime sort");
  })();

  /* ── GL storage health: empty COA heal + Reports mismatch guard ── */
  (function () {
    var store = {
      data: {
        tc3_journal_lines: [{ id: "l1", accountId: "4000", debit: 0, credit: 100, date: "2026-01-01" }],
        tc3_gl_accounts: [],
        tc3_gl_mode: [],
        tc3_journal_hash: [],
        tc3_inventory_layers: [],
      },
      get: function (k, def) {
        return this.data[k] !== undefined ? this.data[k] : def;
      },
      set: function (k, v) { this.data[k] = v; },
    };
    var healed = healGlStorageMetadata(store);
    if (!healed.healed.length || healed.healed.indexOf("coa_empty") < 0) {
      return fail("GL storage heal: empty COA", healed);
    }
    if (!Array.isArray(store.data.tc3_gl_accounts) || !store.data.tc3_gl_accounts.length) {
      return fail("GL storage heal: COA still empty");
    }
    var tb = trialBalance(store.data.tc3_journal_lines, store.data.tc3_gl_accounts);
    if (!tb.rows.length) return fail("GL storage heal: trial balance still empty", tb);
    var diag = diagnoseGlStorage(store);
    if (!diag.ok) return fail("GL storage heal: unexpected critical issues after heal", diag);
    pass("GL storage health — heal empty COA restores trial balance");
  })();

  (function () {
    var store2 = {
      data: {
        tc3_journal_lines: [{ id: "l1", accountId: "1000", debit: 50, credit: 0, date: "2026-01-01" }],
        tc3_gl_accounts: DEFAULT_GL_CHART.slice(),
      },
      get: function (k, def) {
        return this.data[k] !== undefined ? this.data[k] : def;
      },
    };
    if (!hasGlOperationalSalesMismatch(store2, 500)) {
      return fail("GL mismatch guard: expected mismatch when GL income 0 and ops sales > 0");
    }
    pass("GL storage health — detect ops/GL sales mismatch");
  })();
}
