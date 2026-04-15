/**
 * Core accounting regression scenarios (no posting rule changes).
 */
import {
  baseState,
  makeSmock,
  rebuild,
  DEFAULT_GL_CHART,
  validateJournalBalanced,
  validateAccountingCommitInvariants,
  mergeJournalLinesByTransactionId,
  collectStrictPeriodLockOverrideIds,
  evaluateArApPolicy,
  GL,
} from "./lib/harness.mjs";

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
}
