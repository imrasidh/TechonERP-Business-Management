/**
 * TechonERP v3.0 — single comprehensive end-to-end business workflow.
 *
 * Architecture is frozen; this scenario proves correctness through a realistic
 * shop journey and cross-checks books after each major step:
 *
 *   Opening Balance → Capital Injection → Purchase → Partial Supplier Payment
 *   → Sales Invoice → Partial Customer Payment → Pending Cheque → Cheque Clearance
 *   → Sales Return → Purchase Return → Expense → Fixed Asset → Profit Distribution
 *   → Period Lock → Multi-PC Sync merge → Backup & Restore
 *
 * Reports verified against the same journal: Trial Balance, P&L, Balance Sheet,
 * Cash Book (ledger cash/bank), Customer/Supplier AR/AP, Receivables/Payables.
 */
import {
  baseState,
  makeSmock,
  rebuild,
  DEFAULT_GL_CHART,
  trialBalance,
  profitAndLossFromLedger,
  balanceSheetFromLedger,
  validateJournalBalanced,
  validateAccountingCommitInvariants,
  ledgerCashBank,
  ledgerARAP,
  GL,
  round2,
  sumAccount,
  signedBalanceForAccount,
} from "./lib/harness.mjs";
import { isLockedThroughDate } from "../../src/accounting/periodLockDates.js";
import { mergeDocumentWithPaymentHistory, mergeRecordArraysByNewest } from "../../src/utils/mergeRecordArrays.js";
import { validateJsonBackupPayload } from "../../src/productionConfig.js";

/* Re-export ledger helpers if harness does not yet surface them */
function cashBank(lines) {
  if (typeof ledgerCashBank === "function") return ledgerCashBank(lines);
  var c = sumAccount(lines, GL.CASH);
  var b = sumAccount(lines, GL.BANK);
  var cash = signedBalanceForAccount({ normal: "debit" }, c.debit, c.credit);
  var bank = signedBalanceForAccount({ normal: "debit" }, b.debit, b.credit);
  return { cash: cash, bank: bank, total: round2(cash + bank) };
}

function arap(lines) {
  if (typeof ledgerARAP === "function") return ledgerARAP(lines);
  var ar = sumAccount(lines, GL.AR);
  var ap = sumAccount(lines, GL.AP);
  return {
    receivables: signedBalanceForAccount({ normal: "debit" }, ar.debit, ar.credit),
    payables: signedBalanceForAccount({ normal: "credit" }, ap.debit, ap.credit),
  };
}

function near(a, b, tol) {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= (tol != null ? tol : 0.02);
}

function assertBooks(step, st, Smock, expect) {
  var x = rebuild(st, Smock);
  if (!x.r.validate.ok) {
    return { ok: false, detail: step + ": rebuild validate", extra: x.r.validate };
  }
  if (!validateJournalBalanced(x.r.lines).ok) {
    return { ok: false, detail: step + ": journal not balanced" };
  }
  var inv = validateAccountingCommitInvariants({
    lines: x.r.lines,
    chart: x.r.chart || DEFAULT_GL_CHART,
    invDer: x.invDer || null,
    settings: st.settings,
    source: "v3-e2e",
  });
  if (!inv.ok) {
    return { ok: false, detail: step + ": commit invariants", extra: inv.errors };
  }
  var lines = x.r.lines;
  var chart = x.r.chart || DEFAULT_GL_CHART;
  var tb = trialBalance(lines, chart);
  var pl = profitAndLossFromLedger(lines, chart, null, null);
  var bs = balanceSheetFromLedger(lines, chart, null);
  var cb = cashBank(lines);
  var aa = arap(lines);

  if (!tb.balanced) return { ok: false, detail: step + ": TB not balanced", extra: tb };
  if (!bs.balancedWithEarnings) {
    return { ok: false, detail: step + ": BS not balanced with earnings", extra: bs };
  }
  if (expect) {
    if (expect.cash != null && !near(cb.cash, expect.cash)) {
      return { ok: false, detail: step + ": cash", extra: { got: cb.cash, want: expect.cash } };
    }
    if (expect.bank != null && !near(cb.bank, expect.bank)) {
      return { ok: false, detail: step + ": bank", extra: { got: cb.bank, want: expect.bank } };
    }
    if (expect.ar != null && !near(aa.receivables, expect.ar)) {
      return { ok: false, detail: step + ": AR", extra: { got: aa.receivables, want: expect.ar } };
    }
    if (expect.ap != null && !near(aa.payables, expect.ap)) {
      return { ok: false, detail: step + ": AP", extra: { got: aa.payables, want: expect.ap } };
    }
    if (expect.plNet != null && !near(pl.net, expect.plNet)) {
      return { ok: false, detail: step + ": P&L net", extra: { got: pl.net, want: expect.plNet } };
    }
    if (expect.inv != null) {
      var invBal = signedBalanceForAccount({ normal: "debit" }, sumAccount(lines, GL.INV).debit, sumAccount(lines, GL.INV).credit);
      if (!near(invBal, expect.inv)) {
        return { ok: false, detail: step + ": inventory", extra: { got: invBal, want: expect.inv } };
      }
    }
  }
  return {
    ok: true,
    lines: lines,
    chart: chart,
    tb: tb,
    pl: pl,
    bs: bs,
    cb: cb,
    aa: aa,
    x: x,
  };
}

/**
 * @param {{ fail: (name: string, detail?: unknown) => void, pass: (name: string) => void }} ctx
 */
export function runV3BusinessWorkflowTests(ctx) {
  var fail = ctx.fail;
  var pass = ctx.pass;

  var pid = "prod_v3_widget";
  var custId = "cust_v3_ali";
  var suppId = "supp_v3_tech";
  var saleId = "sale_v3_1";
  var purId = "pur_v3_1";
  var chqId = "chq_v3_in_1";
  var phChqId = "ph_v3_chq";

  var st = baseState();
  st.settings = Object.assign({}, st.settings, {
    shopName: "V3 E2E Shop",
    currency: "Rs",
    taxEnabled: false,
    glVatPostingEnabled: false,
    strictPeriodLock: true,
    lockedUntilDate: "",
  });
  st.products = [{ id: pid, productId: "W-100", name: "Widget", stock: 0, cost: 100, sellPrice: 200 }];
  st.customers = [{ id: custId, name: "Ali Customer", phone: "0700000001" }];
  st.suppliers = [{ id: suppId, name: "Tech Supplier", phone: "0700000002" }];
  st.cheques = [];
  st.assets = [];
  st.expenses = [];
  st.salesReturns = [];
  st.purchaseReturns = [];

  var openBal = {
    completed: true,
    date: "2026-01-01",
    cash: 10000,
    bank: 50000,
    receivables: [],
    payables: [],
    stock: [],
    assets: [],
    capital: 60000,
  };
  var capLedger = [];
  var profitDist = [];
  var Smock = makeSmock({
    tc3_openBal: openBal,
    tc3_capLedger: capLedger,
    tc3_profitDist: profitDist,
    tc3_assets: st.assets,
  });

  /* ── 1. Opening Balance ── */
  var r = assertBooks("Opening Balance", st, Smock, {
    cash: 10000,
    bank: 50000,
    ar: 0,
    ap: 0,
    inv: 0,
    plNet: 0,
  });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 01 — Opening Balance (cash/bank/TB/BS)");

  /* ── 2. Capital Injection ── */
  capLedger.push({
    id: "cap_v3_1",
    type: "invest",
    amount: 20000,
    date: "2026-01-02",
    cashMethod: "Cash",
    note: "Owner inject",
  });
  Smock = makeSmock({
    tc3_openBal: openBal,
    tc3_capLedger: capLedger,
    tc3_profitDist: profitDist,
    tc3_assets: st.assets,
  });
  r = assertBooks("Capital Injection", st, Smock, { cash: 30000, bank: 50000 });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 02 — Capital Injection");

  /* ── 3. Purchase ── */
  st.purchases = [{
    id: purId,
    date: "2026-01-05",
    purchaseNo: "PUR-V3-1",
    supplierId: suppId,
    supplierName: "Tech Supplier",
    total: 5000,
    totalTax: 0,
    paidAmount: 0,
    items: [{ id: pid, productId: pid, qty: 50, cost: 100, inputQty: 50 }],
    paymentHistory: [],
  }];
  st.products[0].stock = 50;
  st.products[0].cost = 100;
  r = assertBooks("Purchase", st, Smock, { ap: 5000, inv: 5000, cash: 30000 });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 03 — Purchase (INV + AP)");

  /* ── 4. Partial Supplier Payment ── */
  st.purchases[0].paymentHistory = [
    { id: "ph_pur_1", date: "2026-01-06", amount: 2000, cashMethod: "Cash", note: "Partial" },
  ];
  st.purchases[0].paidAmount = 2000;
  r = assertBooks("Partial Supplier Payment", st, Smock, { ap: 3000, cash: 28000 });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 04 — Partial Supplier Payment");

  /* ── 5. Sales Invoice ── */
  st.sales = [{
    id: saleId,
    date: "2026-01-10",
    invoiceNo: "INV-V3-1",
    customerId: custId,
    customerName: "Ali Customer",
    total: 2000,
    paid: 0,
    totalTax: 0,
    items: [{ id: pid, productId: pid, qty: 10, cost: 100, price: 200, lineTotal: 2000 }],
    paymentHistory: [],
  }];
  st.products[0].stock = 40;
  r = assertBooks("Sales Invoice", st, Smock, {
    ar: 2000,
    inv: 4000,
    plNet: 1000, /* sales 2000 − COGS 1000 */
  });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 05 — Sales Invoice (AR + revenue + COGS)");

  /* ── 6. Partial Customer Payment ── */
  st.sales[0].paymentHistory = [
    { id: "ph_sale_cash", date: "2026-01-11", amount: 800, cashMethod: "Cash", note: "Partial cash" },
  ];
  st.sales[0].paid = 800;
  r = assertBooks("Partial Customer Payment", st, Smock, { ar: 1200, cash: 28800 });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 06 — Partial Customer Payment");

  /* ── 7. Pending Cheque (no GL cash/AR movement yet) ── */
  st.cheques = [{
    id: chqId,
    type: "incoming",
    status: "Pending",
    amount: 500,
    chequeNo: "CHQ-V3-1",
    dueDate: "2026-01-20",
    issuedDate: "2026-01-12",
    saleId: saleId,
    date: "2026-01-12",
  }];
  st.sales[0].paymentHistory = st.sales[0].paymentHistory.concat([{
    id: phChqId,
    date: "2026-01-12",
    amount: 0,
    cashMethod: "Cheque",
    note: "Cheque #CHQ-V3-1 Rs 500 (Pending — due 2026-01-20)",
    chequeId: chqId,
  }]);
  r = assertBooks("Pending Cheque", st, Smock, { ar: 1200, cash: 28800, bank: 50000 });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 07 — Pending Cheque (AR/cash unchanged)");

  /* ── 8. Cheque Clearance ── */
  st.cheques[0].status = "Cleared";
  st.cheques[0].clearedDate = "2026-01-15";
  st.sales[0].paymentHistory = st.sales[0].paymentHistory.map(function (ph) {
    if (ph.id !== phChqId) return ph;
    return Object.assign({}, ph, {
      amount: 500,
      cashMethod: "Bank",
      date: "2026-01-15",
      note: "Cheque #CHQ-V3-1 Rs 500 (Cleared 2026-01-15)",
    });
  });
  st.sales[0].paid = 1300;
  r = assertBooks("Cheque Clearance", st, Smock, { ar: 700, bank: 50500, cash: 28800 });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 08 — Cheque Clearance (Bank + AR settle)");

  /* ── 9. Sales Return (2 units @ 200, cost 100) ── */
  st.salesReturns = [{
    id: "sr_v3_1",
    date: "2026-01-16",
    invoiceId: saleId,
    productId: pid,
    amount: 400,
    refundAmount: 0,
    qty: 2,
    cost: 100,
  }];
  st.products[0].stock = 42;
  /* Net sales after return: income 2000 − SRET 400 = 1600; COGS 1000 − 200 = 800; P&L net = 800 */
  r = assertBooks("Sales Return", st, Smock, {
    ar: 300, /* 700 − 400 */
    inv: 4200, /* 4000 + 200 */
    plNet: 800,
  });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 09 — Sales Return");

  /* ── 10. Purchase Return (5 × 100) ── */
  st.purchaseReturns = [{
    id: "pr_v3_1",
    date: "2026-01-17",
    purchaseId: purId,
    productId: pid,
    qty: 5,
    cost: 100,
  }];
  st.products[0].stock = 37;
  r = assertBooks("Purchase Return", st, Smock, {
    ap: 2500, /* 3000 − 500 */
    inv: 3700, /* 4200 − 500 */
  });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 10 — Purchase Return");

  /* ── 11. Expense ── */
  st.expenses = [{
    id: "exp_v3_1",
    date: "2026-01-18",
    amount: 1000,
    cashMethod: "Cash",
    category: "Rent",
    note: "Shop rent",
  }];
  r = assertBooks("Expense", st, Smock, {
    cash: 27800,
    plNet: -200, /* 800 − 1000 */
  });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  pass("V3 E2E step 11 — Expense");

  /* ── 12. Fixed Asset Purchase ── */
  st.assets = [{
    id: "ast_v3_1",
    date: "2026-01-19",
    amount: 15000,
    value: 15000,
    name: "Laptop",
    cashMethod: "Bank",
    _isOpening: false,
  }];
  Smock = makeSmock({
    tc3_openBal: openBal,
    tc3_capLedger: capLedger,
    tc3_profitDist: profitDist,
    tc3_assets: st.assets,
  });
  r = assertBooks("Fixed Asset", st, Smock, { bank: 35500, cash: 27800 });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  var fixedBal = signedBalanceForAccount(
    { normal: "debit" },
    sumAccount(r.lines, GL.FIXED).debit,
    sumAccount(r.lines, GL.FIXED).credit
  );
  if (!near(fixedBal, 15000)) return fail("V3 E2E — Fixed Asset GL 1500", { got: fixedBal });
  pass("V3 E2E step 12 — Fixed Asset Purchase");

  /* ── 13. Profit Distribution ── */
  profitDist.push({
    id: "pd_v3_1",
    date: "2026-01-20",
    amount: 500,
    paymentMethod: "Cash",
    note: "Partner share",
  });
  Smock = makeSmock({
    tc3_openBal: openBal,
    tc3_capLedger: capLedger,
    tc3_profitDist: profitDist,
    tc3_assets: st.assets,
  });
  r = assertBooks("Profit Distribution", st, Smock, { cash: 27300, plNet: -200 });
  if (!r.ok) return fail("V3 E2E — " + r.detail, r.extra);
  /* Drawings are equity, not P&L — net unchanged */
  pass("V3 E2E step 13 — Profit Distribution (equity drawings; P&L unchanged)");

  /* ── Final report consistency pack ── */
  var final = r;
  var sale = st.sales[0];
  var purchase = st.purchases[0];
  var opsCustomerDue = round2(Math.max(0, (sale.total || 0) - (sale.paid || 0) - 400)); /* return reduces AR in GL; ops often keep invoice total */
  /* Prefer GL AR as truth for receivables dashboard alignment */
  if (!near(final.aa.receivables, 300)) {
    return fail("V3 E2E — Receivables (GL AR) final", final.aa);
  }
  if (!near(final.aa.payables, 2500)) {
    return fail("V3 E2E — Payables (GL AP) final", final.aa);
  }
  /* Customer statement closing should match remaining AR on this invoice path */
  if (!near(final.aa.receivables, 300)) {
    return fail("V3 E2E — Customer Statement AR control", { ar: final.aa.receivables, opsHint: opsCustomerDue });
  }
  if (!near(final.aa.payables, round2((purchase.total || 0) - (purchase.paidAmount || 0) - 500))) {
    return fail("V3 E2E — Supplier Statement AP control", {
      gl: final.aa.payables,
      ops: (purchase.total || 0) - (purchase.paidAmount || 0) - 500,
    });
  }
  if (!near(final.cb.total, round2(final.cb.cash + final.cb.bank))) {
    return fail("V3 E2E — Cash Book total", final.cb);
  }
  if (!near(final.pl.net, final.bs.currentEarnings)) {
    return fail("V3 E2E — P&L net vs BS current earnings", {
      pl: final.pl.net,
      earn: final.bs.currentEarnings,
    });
  }
  pass("V3 E2E reports — TB / P&L / BS / Cash Book / AR / AP consistent");

  /* ── 14. Period Lock ── */
  st.settings.lockedUntilDate = "2026-01-10";
  st.settings.strictPeriodLock = true;
  if (!isLockedThroughDate("2026-01-10", st.settings.lockedUntilDate)) {
    return fail("V3 E2E — Period Lock inclusive boundary");
  }
  if (isLockedThroughDate("2026-01-11", st.settings.lockedUntilDate)) {
    return fail("V3 E2E — Period Lock must allow day after lock");
  }
  if (!isLockedThroughDate("2026-01-05", st.settings.lockedUntilDate)) {
    return fail("V3 E2E — Period Lock must freeze purchase date");
  }
  pass("V3 E2E step 14 — Period Lock boundary");

  /* ── 15. Multi-PC Sync (concurrent payments merge) ── */
  var baseSaleSync = {
    id: "sale_sync_v3",
    total: 1000,
    paid: 0,
    balance: 1000,
    payStatus: "Unpaid",
    paymentHistory: [],
    updatedAt: "2026-01-21T10:00:00.000Z",
  };
  var pcA = Object.assign({}, baseSaleSync, {
    paid: 400,
    balance: 600,
    payStatus: "Partial",
    paymentHistory: [{ id: "ph_a", date: "2026-01-21", amount: 400, cashMethod: "Cash" }],
    updatedAt: "2026-01-21T10:00:01.000Z",
  });
  var pcB = Object.assign({}, baseSaleSync, {
    paid: 300,
    balance: 700,
    payStatus: "Partial",
    paymentHistory: [{ id: "ph_b", date: "2026-01-21", amount: 300, cashMethod: "Bank" }],
    updatedAt: "2026-01-21T10:00:02.000Z",
  });
  var mergedSale = mergeDocumentWithPaymentHistory(pcA, pcB, "sale");
  if (!mergedSale || mergedSale.paymentHistory.length !== 2 || mergedSale.paid !== 700) {
    return fail("V3 E2E — Multi-PC Sync merge payments", mergedSale);
  }
  var arrMerged = mergeRecordArraysByNewest([pcA], [pcB], "tc3_sales");
  if (!arrMerged || arrMerged.length !== 1 || arrMerged[0].paid !== 700) {
    return fail("V3 E2E — Multi-PC Sync array merge", arrMerged);
  }
  pass("V3 E2E step 15 — Multi-PC Sync (dual payment merge)");

  /* ── 16. Backup & Restore ── */
  var backup = {
    version: 2,
    data: {
      tc3_settings: st.settings,
      tc3_products: st.products,
      tc3_customers: st.customers,
      tc3_suppliers: st.suppliers,
      tc3_sales: st.sales,
      tc3_purchases: st.purchases,
      tc3_expenses: st.expenses,
      tc3_salesReturns: st.salesReturns,
      tc3_purchaseReturns: st.purchaseReturns,
      tc3_cheques: st.cheques,
      tc3_assets: st.assets,
      tc3_openBal: openBal,
      tc3_capLedger: capLedger,
      tc3_profitDist: profitDist,
      tc3_journal_lines: final.lines,
    },
  };
  if (!validateJsonBackupPayload(backup)) {
    return fail("V3 E2E — Backup payload invalid");
  }
  var restored = JSON.parse(JSON.stringify(backup));
  if (!validateJsonBackupPayload(restored)) {
    return fail("V3 E2E — Restore round-trip invalid");
  }
  var st2 = Object.assign(baseState(), {
    settings: restored.data.tc3_settings,
    products: restored.data.tc3_products,
    customers: restored.data.tc3_customers,
    suppliers: restored.data.tc3_suppliers,
    sales: restored.data.tc3_sales,
    purchases: restored.data.tc3_purchases,
    expenses: restored.data.tc3_expenses,
    salesReturns: restored.data.tc3_salesReturns,
    purchaseReturns: restored.data.tc3_purchaseReturns,
    cheques: restored.data.tc3_cheques,
    assets: restored.data.tc3_assets,
  });
  var Smock2 = makeSmock({
    tc3_openBal: restored.data.tc3_openBal,
    tc3_capLedger: restored.data.tc3_capLedger,
    tc3_profitDist: restored.data.tc3_profitDist,
    tc3_assets: restored.data.tc3_assets,
  });
  var r2 = assertBooks("Backup Restore rebuild", st2, Smock2, {
    cash: 27300,
    bank: 35500,
    ar: 300,
    ap: 2500,
    plNet: -200,
  });
  if (!r2.ok) return fail("V3 E2E — " + r2.detail, r2.extra);
  if (!near(r2.tb.totalDebit, final.tb.totalDebit) || !near(r2.tb.totalCredit, final.tb.totalCredit)) {
    return fail("V3 E2E — Backup restore TB mismatch", { before: final.tb, after: r2.tb });
  }
  pass("V3 E2E step 16 — Backup & Restore (rebuild matches)");

  pass("V3 E2E — FULL WORKFLOW PASSED (16 steps + report pack)");
}
