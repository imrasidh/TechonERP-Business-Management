/**
 * TechonERP — Double-entry general ledger (derived from canonical ERP records).
 * Rebuilds journal lines from sales, purchases, expenses, returns, opening balance, etc.
 * Persist with S.set("tc3_journal_lines") + S.set("tc3_gl_accounts").
 */

import { getOrCreateDeviceId, stableJournalTransactionId } from "./ids.js";
import { deriveLineStockValue } from "../utils/purchaseValuation.js";

export var GL = {
  CASH: "1000",
  BANK: "1010",
  AR: "1100",
  INV: "1200",
  FIXED: "1500",
  AP: "2000",
  EQUITY: "3000",
  SALES: "4000",
  SRET: "4010",
  REPAIR: "4100",
  COGS: "5000",
  /** Kitchen / raw-material consumption (restaurant ingredient draw — distinct from invoice COGS 5000) */
  COGS_KITCHEN: "5005",
  PUR_VAR: "5200",
  /** Penny differences so invoice totals tie to GL lines exactly */
  ROUND: "5215",
  EXP: "6000",
  DRAW: "6500",
  /** VAT / GST (future-ready; postings optional per transaction) */
  VAT_REC: "1180",
  VAT_PAY: "2150",
};

export var DEFAULT_GL_CHART = [
  { id: GL.CASH, code: "1000", name: "Cash on Hand", type: "asset", normal: "debit" },
  { id: GL.BANK, code: "1010", name: "Bank Accounts", type: "asset", normal: "debit" },
  { id: GL.AR, code: "1100", name: "Accounts Receivable", type: "asset", normal: "debit" },
  { id: GL.INV, code: "1200", name: "Inventory", type: "asset", normal: "debit" },
  { id: GL.FIXED, code: "1500", name: "Fixed & Other Assets", type: "asset", normal: "debit" },
  { id: GL.AP, code: "2000", name: "Accounts Payable", type: "liability", normal: "credit" },
  { id: GL.EQUITY, code: "3000", name: "Owner Equity & Opening Balance", type: "equity", normal: "credit" },
  { id: GL.SALES, code: "4000", name: "Sales Revenue", type: "income", normal: "credit" },
  { id: GL.SRET, code: "4010", name: "Sales Returns & Allowances", type: "contra_income", normal: "debit" },
  { id: GL.REPAIR, code: "4100", name: "Repair Service Revenue", type: "income", normal: "credit" },
  { id: GL.COGS, code: "5000", name: "Cost of Goods Sold", type: "expense", normal: "debit" },
  { id: GL.COGS_KITCHEN, code: "5005", name: "Kitchen Consumption (Raw Materials)", type: "expense", normal: "debit" },
  { id: GL.PUR_VAR, code: "5200", name: "Purchase Rounding / Tax Variance", type: "expense", normal: "debit" },
  { id: GL.ROUND, code: "5215", name: "Rounding Adjustment", type: "expense", normal: "debit" },
  { id: GL.EXP, code: "6000", name: "Operating Expenses", type: "expense", normal: "debit" },
  { id: GL.DRAW, code: "6500", name: "Owner Drawings & Distributions", type: "equity", normal: "debit" },
  { id: GL.VAT_REC, code: "1180", name: "VAT / GST Receivable (Input tax)", type: "asset", normal: "debit" },
  { id: GL.VAT_PAY, code: "2150", name: "VAT / GST Payable (Output tax)", type: "liability", normal: "credit" },
];

/** Two-decimal money and quantity boundary (use at journal line write, layer snapshot, and report totals). */
export function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

function cashBankFromMethod(m) {
  var cm = (m || "Cash") === "Bank" ? GL.BANK : GL.CASH;
  return cm;
}

/**
 * FIFO layer consumption (optional). Products may define fifoBatches: [{ qty, unitCost }], oldest first.
 * Falls back to line cost × qty when batches absent or method is wac.
 */
function fifoLineCOGS(it, product, qty) {
  var q = qty || 0;
  if (q <= 0) return 0;
  var batches = product && Array.isArray(product.fifoBatches) ? product.fifoBatches.slice() : [];
  if (!batches.length) return round2((it.cost || 0) * q);
  var need = q;
  var cost = 0;
  var i = 0;
  while (need > 0 && i < batches.length) {
    var b = batches[i];
    var bq = Math.max(0, b.qty || 0);
    var uc = round2(b.unitCost != null ? b.unitCost : b.cost || 0);
    if (bq <= 0) {
      i++;
      continue;
    }
    var take = Math.min(need, bq);
    cost += round2(take * uc);
    need = round2(need - take);
    i++;
  }
  if (need > 0.0001) cost += round2(need * (it.cost || 0));
  return round2(cost);
}

export function saleLineCOGS(s, state) {
  var method = (state && state.settings && state.settings.inventoryCostingMethod) || "wac";
  var productsById = {};
  if (state && state.products) {
    (state.products || []).forEach(function (p) {
      if (p && p.id != null) productsById[p.id] = p;
    });
  }
  return (s.items || []).reduce(function (a, it) {
    var q = it.qty || 0;
    if (method === "fifo") {
      var pr = productsById[it.id] || productsById[it.productId];
      return a + fifoLineCOGS(it, pr, q);
    }
    return a + round2((it.cost || 0) * q);
  }, 0);
}

function purchaseInventoryVal(p) {
  return (p.items || []).reduce(function (a, it) {
    /* Align with purchase lines: base qty × per-base cost, or deriveLineStockValue (lineStockValue / legacy) */
    return a + round2(deriveLineStockValue(it));
  }, 0);
}

/**
 * Append one balanced journal entry. Throws if debits !== credits.
 * opts.sliceKey — stable sub-id for the same reference (e.g. revenue vs COGS).
 */
export function appendEntry(lines, genId, date, referenceType, referenceId, parts, memoRoot, opts) {
  opts = opts || {};
  var deviceId = opts.deviceId || getOrCreateDeviceId();
  var sliceKey = opts.sliceKey || "main";
  var transactionId = opts.transactionId || stableJournalTransactionId(referenceType, referenceId, sliceKey);
  var entryGroupId = transactionId;
  var td = 0;
  var tc = 0;
  var i;
  for (i = 0; i < parts.length; i++) {
    td += round2(parts[i].debit || 0);
    tc += round2(parts[i].credit || 0);
  }
  if (round2(td - tc) !== 0) {
    throw new Error("Unbalanced entry " + referenceType + " " + referenceId + ": Dr " + td + " Cr " + tc);
  }
  var pushedCount = 0;
  for (i = 0; i < parts.length; i++) {
    var p = parts[i];
    var d = round2(p.debit || 0);
    var c = round2(p.credit || 0);
    if (d === 0 && c === 0) continue;
    pushedCount++;
    lines.push({
      id: genId(),
      transactionId: transactionId,
      entryGroupId: entryGroupId,
      deviceId: deviceId,
      isPosted: true,
      date: date || "",
      accountId: p.accountId,
      debit: d,
      credit: c,
      referenceType: referenceType,
      referenceId: referenceId,
      memo: (p.memo || "") + (memoRoot ? " · " + memoRoot : ""),
    });
  }
  if (pushedCount > 0) {
    var ad = 0;
    var ac = 0;
    var j;
    for (j = lines.length - pushedCount; j < lines.length; j++) {
      ad += round2(lines[j].debit || 0);
      ac += round2(lines[j].credit || 0);
    }
    if (round2(ad - ac) !== 0) {
      try {
        var isDev =
          (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true) ||
          (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development");
        if (isDev && typeof console !== "undefined" && console.warn) {
          console.warn("[TechonERP GL] appendEntry post-push drift", referenceType, referenceId, "Dr", ad, "Cr", ac);
        }
      } catch (e1) { /* ignore */ }
    }
  }
}

export function validateJournalBalanced(lines) {
  var byG = {};
  var i;
  for (i = 0; i < lines.length; i++) {
    var ln = lines[i];
    var g = ln.entryGroupId || ln.id;
    if (!byG[g]) byG[g] = { d: 0, c: 0 };
    byG[g].d += round2(ln.debit || 0);
    byG[g].c += round2(ln.credit || 0);
  }
  var bad = [];
  Object.keys(byG).forEach(function (k) {
    if (round2(byG[k].d - byG[k].c) !== 0) bad.push({ entryGroupId: k, debit: byG[k].d, credit: byG[k].c });
  });
  return { ok: bad.length === 0, imbalances: bad };
}

/** Signed balance: positive = normal direction for that account */
export function signedBalanceForAccount(accountMeta, debitSum, creditSum) {
  var nb = accountMeta && accountMeta.normal === "credit" ? "credit" : "debit";
  if (nb === "debit") return round2(debitSum - creditSum);
  return round2(creditSum - debitSum);
}

export function sumAccount(lines, accountId) {
  var d = 0;
  var c = 0;
  var i;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].accountId !== accountId) continue;
    d += round2(lines[i].debit || 0);
    c += round2(lines[i].credit || 0);
  }
  return { debit: d, credit: c };
}

export function accountBalanceMap(lines, chart) {
  var meta = {};
  chart.forEach(function (a) { meta[a.id] = a; });
  var bal = {};
  chart.forEach(function (a) {
    var s = sumAccount(lines, a.id);
    bal[a.id] = signedBalanceForAccount(meta[a.id], s.debit, s.credit);
  });
  return bal;
}

export function trialBalance(lines, chart) {
  var rows = [];
  var tDr = 0;
  var tCr = 0;
  chart.forEach(function (a) {
    var s = sumAccount(lines, a.id);
    if (s.debit === 0 && s.credit === 0) return;
    rows.push({
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: s.debit,
      credit: s.credit,
    });
    tDr += s.debit;
    tCr += s.credit;
  });
  return { rows: rows, totalDebit: round2(tDr), totalCredit: round2(tCr), balanced: round2(tDr - tCr) === 0 };
}

export function getLedgerForAccount(lines, accountId, limit) {
  var out = [];
  var i;
  for (i = lines.length - 1; i >= 0; i--) {
    if (lines[i].accountId !== accountId) continue;
    out.push(lines[i]);
    if (limit && out.length >= limit) break;
  }
  return out.reverse();
}

export function runningBalanceForAccount(lines, accountId, chartRow) {
  var meta = chartRow || { normal: "debit" };
  var sorted = lines.filter(function (ln) { return ln.accountId === accountId; }).slice().sort(function (a, b) {
    var da = (a.date || "").localeCompare(b.date || "");
    if (da !== 0) return da;
    return String(a.id).localeCompare(String(b.id));
  });
  var run = 0;
  return sorted.map(function (ln) {
    if (meta.normal === "credit") {
      run = round2(run + round2(ln.credit || 0) - round2(ln.debit || 0));
    } else {
      run = round2(run + round2(ln.debit || 0) - round2(ln.credit || 0));
    }
    return { line: ln, running: run };
  });
}

/**
 * Rebuild all journal lines from ERP state + S-side keys (opening balance, manuals, etc.)
 * @param invDer optional output of deriveInventoryEconomics() for layer-based COGS / reconciliation.
 */
export function rebuildJournalFromState(state, S, genId, invDer) {
  var lines = [];
  var warnings = [];
  var chart = DEFAULT_GL_CHART.slice();
  var gid = typeof genId === "function" ? genId : function () { return "gl_" + Math.random().toString(36).slice(2); };
  var deviceId = getOrCreateDeviceId();

  function cogsForSale(s) {
    if (invDer && invDer.cogsBySaleId && invDer.cogsBySaleId[s.id] != null) {
      return round2(invDer.cogsBySaleId[s.id]);
    }
    return saleLineCOGS(s, state);
  }

  function add(date, refType, refId, parts, memo, sliceKey) {
    try {
      appendEntry(lines, gid, date, refType, refId, parts, memo || "", { sliceKey: sliceKey || "main", deviceId: deviceId });
    } catch (e) {
      warnings.push(String(e.message || e));
    }
  }

  /* ── Opening balance (one balancing entry to equity) ── */
  var ob = S.get("tc3_openBal", null);
  if (ob && ob.completed) {
    var dCash = round2(ob.cash || 0);
    var dBank = round2(ob.bank || 0);
    var dRecv = (ob.receivables || []).reduce(function (a, r) { return a + round2(r.amount || 0); }, 0);
    var dPay = (ob.payables || []).reduce(function (a, p) { return a + round2(p.amount || 0); }, 0);
    var dStock = (ob.stock || []).reduce(function (a, s) { return a + round2((s.cost || 0) * (s.qty || 0)); }, 0);
    var dAst = (ob.assets || []).reduce(function (a, x) { return a + round2(x.value || 0); }, 0);
    var totalDr = dCash + dBank + dRecv + dStock + dAst;
    var totalCr = dPay;
    var eq = round2(totalDr - totalCr);
    var partsOB = [];
    if (dCash > 0) partsOB.push({ accountId: GL.CASH, debit: dCash, credit: 0, memo: "Opening" });
    if (dBank > 0) partsOB.push({ accountId: GL.BANK, debit: dBank, credit: 0, memo: "Opening" });
    if (dRecv > 0) partsOB.push({ accountId: GL.AR, debit: dRecv, credit: 0, memo: "Opening receivables" });
    if (dStock > 0) partsOB.push({ accountId: GL.INV, debit: dStock, credit: 0, memo: "Opening stock" });
    if (dAst > 0) partsOB.push({ accountId: GL.FIXED, debit: dAst, credit: 0, memo: "Opening assets" });
    if (dPay > 0) partsOB.push({ accountId: GL.AP, debit: 0, credit: dPay, memo: "Opening payables" });
    if (eq !== 0) partsOB.push({ accountId: GL.EQUITY, debit: eq < 0 ? -eq : 0, credit: eq > 0 ? eq : 0, memo: "Opening equity plug" });
    if (partsOB.length) {
      add(ob.date || (state.settings && state.settings.booksClosedDate) || "", "opening_balance", "ob-1", partsOB, "Opening balance wizard");
    }
  }

  /* ── Capital ledger ── */
  (S.get("tc3_capLedger", []) || []).forEach(function (e, idx) {
    if (e.cashMethod === "Opening") return;
    var amt = round2(e.amount || 0);
    if (amt <= 0) return;
    var dt = e.date || "";
    var acc = cashBankFromMethod(e.cashMethod);
    if (e.type === "invest") {
      add(dt, "capital", "cap-" + idx, [
        { accountId: acc, debit: amt, credit: 0 },
        { accountId: GL.EQUITY, debit: 0, credit: amt },
      ], e.note || "Capital invest");
    } else {
      add(dt, "capital", "capw-" + idx, [
        { accountId: GL.EQUITY, debit: amt, credit: 0 },
        { accountId: acc, debit: 0, credit: amt },
      ], e.note || "Capital withdraw");
    }
  });

  /* ── Sales (revenue + cash/AR + COGS; optional VAT split) ── */
  var taxSettings = state.settings || {};
  var glVatPosting = taxSettings.glVatPostingEnabled !== false;
  (state.sales || []).forEach(function (s) {
    var dt = s.date || "";
    var inv = cogsForSale(s);
    var tot = round2(s.total || 0);
    var paid = round2(s.paid || 0);
    var parts = [];
    var taxAmt = round2(s.totalTax || 0);
    if (glVatPosting && taxSettings.taxEnabled && taxAmt > 0.005) {
      var netSales = round2(tot - taxAmt);
      if (netSales < 0) netSales = 0;
      parts.push({ accountId: GL.SALES, debit: 0, credit: netSales, memo: "Net sales · " + (s.invoiceNo || "") });
      parts.push({ accountId: GL.VAT_PAY, debit: 0, credit: taxAmt, memo: "VAT · " + (s.invoiceNo || "") });
      var revPlug = round2(tot - netSales - taxAmt);
      if (Math.abs(revPlug) > 0.0001) {
        if (revPlug > 0) {
          parts.push({ accountId: GL.ROUND, debit: 0, credit: revPlug, memo: "Rounding · " + (s.invoiceNo || "") });
        } else {
          parts.push({ accountId: GL.ROUND, debit: -revPlug, credit: 0, memo: "Rounding · " + (s.invoiceNo || "") });
        }
      }
    } else {
      parts.push({ accountId: GL.SALES, debit: 0, credit: tot, memo: "Invoice " + (s.invoiceNo || "") });
    }
    (s.paymentHistory || []).forEach(function (ph) {
      var a = round2(ph.amount || 0);
      if (a <= 0) return;
      parts.push({ accountId: cashBankFromMethod(ph.cashMethod), debit: a, credit: 0, memo: ph.note || "Payment" });
    });
    var phSum = (s.paymentHistory || []).reduce(function (a, ph) { return a + round2(ph.amount || 0); }, 0);
    var arAmt = round2(tot - phSum);
    if (arAmt > 0.005) {
      parts.push({ accountId: GL.AR, debit: arAmt, credit: 0, memo: "Outstanding" });
    } else if (arAmt < -0.005) {
      warnings.push("Sale " + (s.invoiceNo || s.id) + ": payments exceed total — GL skipped AR line");
    }
    add(dt, "sale", s.id, parts, "Sale", "rev");
    if (inv > 0) {
      add(dt, "sale_cogs", s.id, [
        { accountId: GL.COGS, debit: inv, credit: 0 },
        { accountId: GL.INV, debit: 0, credit: inv },
      ], "COGS", "cogs");
    }
  });

  /* ── Purchases: inventory + AP (+ input VAT when recorded), then payments ── */
  (state.purchases || []).forEach(function (p, idx) {
    var dt = p.date || "";
    var invVal = purchaseInventoryVal(p);
    var apTot = round2(p.total || 0);
    var taxIn = round2(p.totalTax || 0);
    var pp;
    var diff;
    if (glVatPosting && taxSettings.taxEnabled && taxIn > 0.005) {
      var baseSum = round2(invVal + taxIn);
      diff = round2(apTot - baseSum);
      pp = [
        { accountId: GL.INV, debit: invVal, credit: 0 },
        { accountId: GL.VAT_REC, debit: taxIn, credit: 0, memo: "Input VAT" },
        { accountId: GL.AP, debit: 0, credit: apTot },
      ];
      if (diff > 0.005) {
        pp.push({ accountId: GL.PUR_VAR, debit: diff, credit: 0, memo: "Invoice vs stock+tax" });
      } else if (diff < -0.005) {
        pp.push({ accountId: GL.PUR_VAR, debit: 0, credit: -diff, memo: "Vendor discount / variance" });
      }
    } else {
      diff = round2(apTot - invVal);
      pp = [
        { accountId: GL.INV, debit: invVal, credit: 0 },
        { accountId: GL.AP, debit: 0, credit: apTot },
      ];
      if (diff > 0.005) {
        pp.push({ accountId: GL.PUR_VAR, debit: diff, credit: 0, memo: "Invoice vs stock cost" });
      } else if (diff < -0.005) {
        pp.push({ accountId: GL.PUR_VAR, debit: 0, credit: -diff, memo: "Vendor discount / variance" });
      }
    }
    add(dt, "purchase", p.id, pp, "Purchase " + (p.purchaseNo || ""));
    (p.paymentHistory || []).forEach(function (ph, j) {
      var a = round2(ph.amount || 0);
      if (a <= 0) return;
      add(ph.date || dt, "purchase_payment", p.id + "-pay-" + j, [
        { accountId: GL.AP, debit: a, credit: 0 },
        { accountId: cashBankFromMethod(ph.cashMethod), debit: 0, credit: a },
      ], "Supplier pay");
    });
  });

  /* ── Expenses ── */
  (state.expenses || []).forEach(function (e) {
    var dt = e.date || "";
    var amt = round2(e.amount || 0);
    if (amt <= 0) return;
    var acc = cashBankFromMethod(e.cashMethod || (e.payMode === "Bank Transfer" || e.payMode === "Online" ? "Bank" : "Cash"));
    add(dt, "expense", e.id, [
      { accountId: GL.EXP, debit: amt, credit: 0, memo: e.category || e.type || "" },
      { accountId: acc, debit: 0, credit: amt },
    ], e.note || "Expense");
  });

  /* ── Fixed asset purchases (non-opening) ── */
  (state.assets || []).forEach(function (a) {
    if (a.cashMethod === "Opening") return;
    var dt = a.date || "";
    var amt = round2(a.amount || a.value || 0);
    if (amt <= 0) return;
    var acc = cashBankFromMethod(a.cashMethod);
    add(dt, "asset", a.id, [
      { accountId: GL.FIXED, debit: amt, credit: 0 },
      { accountId: acc, debit: 0, credit: amt },
    ], a.name || "Asset");
  });

  /* ── Manual payables / receivables (mirror getCashBalances) ── */
  (S.get("tc3_manualPayables", []) || []).forEach(function (mp) {
    if (mp._isOpening) {
      (mp.paymentHistory || []).forEach(function (ph, j) {
        var a = round2(ph.amount || 0);
        if (a <= 0) return;
        add(ph.date || "", "manual_payable_pay", mp.id + "-ph-" + j, [
          { accountId: GL.AP, debit: a, credit: 0 },
          { accountId: cashBankFromMethod(ph.cashMethod), debit: 0, credit: a },
        ], "Pay loan");
      });
      return;
    }
    var amt = round2(mp.amount || 0);
    if (amt <= 0) return;
    add(mp.date || "", "manual_payable", mp.id, [
      { accountId: cashBankFromMethod(mp.paymentMethod), debit: amt, credit: 0, memo: "Borrowed" },
      { accountId: GL.AP, debit: 0, credit: amt },
    ], mp.source || "Manual payable");
    (mp.paymentHistory || []).forEach(function (ph, j) {
      var a = round2(ph.amount || 0);
      if (a <= 0) return;
      add(ph.date || "", "manual_payable_pay", mp.id + "-ph-" + j, [
        { accountId: GL.AP, debit: a, credit: 0 },
        { accountId: cashBankFromMethod(ph.cashMethod), debit: 0, credit: a },
      ], "Repay");
    });
  });

  (S.get("tc3_manualReceivables", []) || []).forEach(function (mr) {
    if (mr._isOpening) {
      (mr.paymentHistory || []).forEach(function (ph, j) {
        var a = round2(ph.amount || 0);
        if (a <= 0) return;
        add(ph.date || "", "manual_receivable_coll", mr.id + "-ph-" + j, [
          { accountId: cashBankFromMethod(ph.cashMethod), debit: a, credit: 0 },
          { accountId: GL.AR, debit: 0, credit: a },
        ], "Collect");
      });
      return;
    }
    var amt = round2(mr.amount || 0);
    if (amt <= 0) return;
    add(mr.date || "", "manual_receivable", mr.id, [
      { accountId: GL.AR, debit: amt, credit: 0, memo: "Loan given" },
      { accountId: cashBankFromMethod(mr.paymentMethod), debit: 0, credit: amt },
    ], mr.person || "Manual receivable");
    (mr.paymentHistory || []).forEach(function (ph, j) {
      var a = round2(ph.amount || 0);
      if (a <= 0) return;
      add(ph.date || "", "manual_receivable_coll", mr.id + "-ph-" + j, [
        { accountId: cashBankFromMethod(ph.cashMethod), debit: a, credit: 0 },
        { accountId: GL.AR, debit: 0, credit: a },
      ], "Collect");
    });
  });

  /* ── Sales returns (contra revenue + AR and/or cash/bank; COGS reversal) ── */
  (state.salesReturns || []).forEach(function (r) {
    var dt = r.date || "";
    var retail = round2(r.amount || 0);
    var rf = round2(r.refundAmount || 0);
    var cost = round2((r.cost || 0) * (r.qty || 0));
    if (retail > 0) {
      var arCr = round2(retail - rf);
      var parts = [{ accountId: GL.SRET, debit: retail, credit: 0, memo: "Return" }];
      if (arCr > 0.005) {
        parts.push({ accountId: GL.AR, debit: 0, credit: arCr, memo: "Reduce receivable / on account" });
      }
      if (rf > 0.005) {
        var acc = r.refundMethod === "Bank" ? GL.BANK : GL.CASH;
        parts.push({ accountId: acc, debit: 0, credit: rf, memo: "Refund to customer" });
      }
      add(dt, "sales_return", r.id, parts, "Sales return");
    }
    if (cost > 0) {
      add(dt, "sales_return_cogs", r.id + "-c", [
        { accountId: GL.INV, debit: cost, credit: 0 },
        { accountId: GL.COGS, debit: 0, credit: cost },
      ], "COGS reversal · stock back", "cogs");
    }
  });

  /* ── Purchase returns — inventory credit uses (qty × line unit cost) stored on the return row
     (captured from the purchase line; policy: settings.purchaseReturnCostMode, current_wac = that line / WAC snapshot) ── */
  (state.purchaseReturns || []).forEach(function (r) {
    var dt = r.date || "";
    var cost = round2((r.cost || 0) * (r.qty || 0));
    if (cost > 0) {
      add(dt, "purchase_return", r.id, [
        { accountId: GL.AP, debit: cost, credit: 0 },
        { accountId: GL.INV, debit: 0, credit: cost },
      ], "PR");
    }
    if (r.isRefund && r.refundAmount > 0) {
      var rf = round2(r.refundAmount);
      var acc = r.refundMethod === "Bank" ? GL.BANK : GL.CASH;
      add(dt, "purchase_return_refund", r.id + "-rf", [
        { accountId: acc, debit: rf, credit: 0 },
        { accountId: GL.AP, debit: 0, credit: rf },
      ], "Supplier refund");
    }
  });

  /* ── Profit distribution ── */
  (S.get("tc3_profitDist", []) || []).forEach(function (pd, idx) {
    var amt = round2(pd.amount || 0);
    if (amt <= 0) return;
    var acc = cashBankFromMethod(pd.paymentMethod);
    add(pd.date || "", "profit_dist", "pd-" + idx, [
      { accountId: GL.DRAW, debit: amt, credit: 0 },
      { accountId: acc, debit: 0, credit: amt },
    ], pd.note || "Distribution");
  });

  /* ── Raw material kitchen usage (inventory replay → GL; idempotent ref raw_usage_YYYY-MM-DD per day) ── */
  var kitchenByDate = {};
  if (invDer && Array.isArray(invDer.movements)) {
    invDer.movements.forEach(function (mv) {
      if (!mv || mv.referenceType !== "raw_material_usage") return;
      var tc = mv.totalCost != null ? round2(mv.totalCost) : round2((mv.qtyOut || 0) * round2(mv.unitCost || 0));
      if (!(tc > 0.0001)) return;
      var d = String(mv.date || "");
      kitchenByDate[d] = round2((kitchenByDate[d] || 0) + tc);
    });
  }
  Object.keys(kitchenByDate).sort(function (a, b) {
    return String(a).localeCompare(String(b));
  }).forEach(function (d) {
    var amt = kitchenByDate[d];
    if (amt > 0.0001) {
      add(d, "raw_material_usage", "raw_usage_" + d, [
        { accountId: GL.COGS_KITCHEN, debit: amt, credit: 0, memo: "Kitchen RM" },
        { accountId: GL.INV, debit: 0, credit: amt, memo: "Inventory drawn down" },
      ], "Kitchen consumption · " + d, "kitchen");
    }
  });

  /* Repairs: revenue is recognized on POS invoice (fromRepairId) or excluded from cash GL
     to match getCashBalances — do not accrue here (would risk double-count vs P&L). */

  if (invDer && invDer.blockingErrors && invDer.blockingErrors.length) {
    invDer.blockingErrors.forEach(function (b) {
      warnings.push(b);
    });
  }

  var v = validateJournalBalanced(lines);
  return {
    lines: lines,
    chart: chart,
    warnings: warnings,
    valid: v.ok && warnings.length === 0,
    validate: v,
  };
}

export function ledgerCashBank(lines) {
  var c = sumAccount(lines, GL.CASH);
  var b = sumAccount(lines, GL.BANK);
  var cash = signedBalanceForAccount({ normal: "debit" }, c.debit, c.credit);
  var bank = signedBalanceForAccount({ normal: "debit" }, b.debit, b.credit);
  return {
    cash: cash,
    bank: bank,
    total: round2(cash + bank),
  };
}

export function ledgerARAP(lines) {
  var ar = sumAccount(lines, GL.AR);
  var ap = sumAccount(lines, GL.AP);
  return {
    receivables: signedBalanceForAccount({ normal: "debit" }, ar.debit, ar.credit),
    payables: signedBalanceForAccount({ normal: "credit" }, ap.debit, ap.credit),
  };
}

/** P&L from ledger for optional date filter (inclusive ISO dates) */
export function profitAndLossFromLedger(lines, chart, fromDate, toDate) {
  var inRange = function (d) {
    if (!fromDate && !toDate) return true;
    if (!d) return true;
    if (fromDate && String(d) < String(fromDate)) return false;
    if (toDate && String(d) > String(toDate)) return false;
    return true;
  };
  var f = lines.filter(function (ln) { return inRange(ln.date); });
  var inc = 0;
  var exp = 0;
  chart.forEach(function (a) {
    if (a.type !== "income" && a.type !== "expense" && a.type !== "contra_income") return;
    var s = sumAccount(f, a.id);
    var bal = signedBalanceForAccount(a, s.debit, s.credit);
    if (a.type === "income") inc += bal;
    if (a.type === "contra_income") inc -= bal;
    if (a.type === "expense") exp += bal;
  });
  return { income: round2(inc), expenses: round2(exp), net: round2(inc - exp) };
}

export function balanceSheetFromLedger(lines, chart, asOfDate) {
  var f = asOfDate ? lines.filter(function (ln) { return !ln.date || String(ln.date) <= String(asOfDate); }) : lines;
  var assets = 0;
  var liab = 0;
  var eq = 0;
  chart.forEach(function (a) {
    if (a.type !== "asset" && a.type !== "liability" && a.type !== "equity") return;
    var s = sumAccount(f, a.id);
    var bal = signedBalanceForAccount(a, s.debit, s.credit);
    if (a.type === "asset") assets += bal;
    if (a.type === "liability") liab += bal;
    if (a.type === "equity") eq += bal;
  });
  var rhs = round2(liab + eq);
  var diff = round2(assets - rhs);
  /* Unclosed P&L (income/expense) lives outside BS equity until closing entries — include for equation display only */
  var pnlThrough = profitAndLossFromLedger(f, chart, null, asOfDate);
  var currentEarnings = round2(pnlThrough.net);
  var equityWithCurrentEarnings = round2(eq + currentEarnings);
  var rhsWithEarn = round2(liab + equityWithCurrentEarnings);
  var diffWithEarnings = round2(assets - rhsWithEarn);
  var tol = 0.02;
  var balancedWithEarnings = Math.abs(diffWithEarnings) <= tol;
  return {
    assets: round2(assets),
    liabilities: round2(liab),
    equity: round2(eq),
    balanced: diff === 0,
    difference: diff,
    rhsTotal: rhs,
    equityBase: round2(eq),
    currentEarnings: currentEarnings,
    equityWithCurrentEarnings: equityWithCurrentEarnings,
    balancedWithEarnings: balancedWithEarnings,
    differenceWithEarnings: diffWithEarnings,
    rhsTotalWithEarnings: rhsWithEarn,
  };
}

/** Stable checksum for comparing client vs server journal_lines payloads. */
export function hashJournalLines(lines) {
  try {
    var norm = (lines || []).map(function (ln) {
      return {
        id: String(ln.id || ""),
        transactionId: String(ln.transactionId || ln.entryGroupId || ""),
        entryGroupId: String(ln.entryGroupId || ""),
        accountId: String(ln.accountId || ""),
        debit: round2(ln.debit || 0),
        credit: round2(ln.credit || 0),
        date: String(ln.date || ""),
        referenceType: String(ln.referenceType || ""),
        referenceId: String(ln.referenceId || ""),
      };
    });
    norm.sort(function (a, b) {
      var c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      c = a.id.localeCompare(b.id);
      if (c !== 0) return c;
      return a.entryGroupId.localeCompare(b.entryGroupId);
    });
    var s = JSON.stringify(norm);
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h = h | 0;
    }
    return "djb2_" + (h >>> 0).toString(16);
  } catch (e) {
    return "";
  }
}
