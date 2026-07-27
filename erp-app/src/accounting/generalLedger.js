/**
 * TechonERP — Double-entry general ledger (derived from canonical ERP records).
 * Rebuilds journal lines from sales, purchases, expenses, returns, opening balance, etc.
 * Persist with S.set("tc3_journal_lines") + S.set("tc3_gl_accounts").
 */

import { getOrCreateDeviceId, stableJournalTransactionId } from "./ids.js";
import { deriveLineStockValue } from "../utils/purchaseValuation.js";
import { computeReturnLineTax, computePurchaseReturnTax, computeSaleTaxFromSnapshot, isPurchaseTaxInclusive } from "../tax/taxCompute.js";
import { isVoidedTxn, isReturnParentEconomicallyActive } from "../utils/voidInvoice.js";
import { glassInvoiceLineTotal } from "../utils/glassProduct.js";

export var GL = {
  CASH: "1000",
  BANK: "1010",
  AR: "1100",
  INV: "1200",
  FIXED: "1500",
  /** Unallocated receipts (standalone incoming cheques / uncleared deposits) */
  CLEARING: "1195",
  /** Supplier payments above invoice total (asset until applied) */
  VENDOR_PREPAY: "1300",
  AP: "2000",
  EQUITY: "3000",
  SALES: "4000",
  SRET: "4010",
  REPAIR: "4100",
  COGS: "5000",
  /** Kitchen / raw-material consumption (restaurant ingredient draw — distinct from invoice COGS 5000) */
  COGS_KITCHEN: "5005",
  DAMAGE: "5010",
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
  { id: GL.CLEARING, code: "1195", name: "Unallocated Receipts / Customer Credits", type: "liability", normal: "credit" },
  { id: GL.VENDOR_PREPAY, code: "1300", name: "Vendor Prepayments", type: "asset", normal: "debit" },
  { id: GL.AP, code: "2000", name: "Accounts Payable", type: "liability", normal: "credit" },
  { id: GL.EQUITY, code: "3000", name: "Owner Equity & Opening Balance", type: "equity", normal: "credit" },
  { id: GL.SALES, code: "4000", name: "Sales Revenue", type: "income", normal: "credit" },
  { id: GL.SRET, code: "4010", name: "Sales Returns & Allowances", type: "contra_income", normal: "debit" },
  { id: GL.REPAIR, code: "4100", name: "Repair Service Revenue", type: "income", normal: "credit" },
  { id: GL.COGS, code: "5000", name: "Cost of Goods Sold", type: "expense", normal: "debit" },
  { id: GL.COGS_KITCHEN, code: "5005", name: "Kitchen Consumption (Raw Materials)", type: "expense", normal: "debit" },
  { id: GL.DAMAGE, code: "5010", name: "Inventory Damage / Write-off", type: "expense", normal: "debit" },
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

/** Card / Online / Cheque clearings settle through bank, not cash drawer. */
export function isBankLikeCashMethod(m) {
  var s = String(m || "Cash");
  return s === "Bank" || s === "Card" || s === "Online" || s === "Cheque" || s === "Bank Transfer";
}

/** Normalize POS method labels to Cash | Bank for storage / balances. */
export function normalizeCashMethodForStorage(m) {
  if (m === "Cheque" || m === "ChequePending" || m === "Adjustment" || m === "Opening") return m;
  return isBankLikeCashMethod(m) ? "Bank" : "Cash";
}

function cashBankFromMethod(m) {
  return isBankLikeCashMethod(m) ? GL.BANK : GL.CASH;
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

function saleLineGross(it) {
  if (!it) return 0;
  if (it.isGlassLine) return round2(glassInvoiceLineTotal(it));
  if (it.lineTotal != null && it.lineTotal !== "" && !isNaN(Number(it.lineTotal))) {
    return round2(Number(it.lineTotal));
  }
  return round2((Number(it.qty) || 0) * (Number(it.price) || 0));
}

/**
 * Original sale total/tax from item lines (Returns.jsx does not mutate item qtys).
 * Prefer this over adding return gross back onto parent.total (which double-counts when
 * the parent was never mutated, e.g. static accounting tests).
 */
export function getOriginalSaleTotalAndTax(s, taxSettings) {
  taxSettings = taxSettings || {};
  var items = (s && s.items) || [];
  if (!items.length) {
    return { total: round2((s && s.total) || 0), tax: round2((s && s.totalTax) || 0) };
  }
  var sub = 0;
  for (var i = 0; i < items.length; i++) sub = round2(sub + saleLineGross(items[i]));
  var disc = round2((s && s.discount) || 0);
  var afterDisc = Math.max(0, round2(sub - disc));
  var taxMode = s.taxMode === "inclusive" || s.taxMode === "exclusive"
    ? s.taxMode
    : (taxSettings.taxMode === "inclusive" ? "inclusive" : "exclusive");
  var hasSnap = (Number(s.totalTax) > 0) || (s.selectedTaxes && s.selectedTaxes.length > 0);
  var taxOn = !!(taxSettings.taxEnabled || hasSnap);
  if (!taxOn) return { total: afterDisc, tax: 0 };

  var snapSale = {
    totalTax: s.totalTax,
    taxMode: taxMode,
    selectedTaxes: (s.selectedTaxes && s.selectedTaxes.length)
      ? s.selectedTaxes
      : (taxSettings.selectedTaxes || []),
    taxCompoundMode: s.taxCompoundMode || taxSettings.taxCompoundMode,
  };
  var taxApplyBase = s.taxApplyBase || taxSettings.taxApplyBase || "after_discount";
  var taxableInput = taxMode === "inclusive"
    ? afterDisc
    : (taxApplyBase === "before_discount" ? sub : afterDisc);
  var tc = computeSaleTaxFromSnapshot(snapSale, taxableInput);
  var tax = round2(tc.totalTax || 0);
  if (!tax && Number(s.totalTax) > 0) tax = round2(s.totalTax);
  if (taxMode === "inclusive") return { total: afterDisc, tax: tax };
  return { total: round2(afterDisc + tax), tax: tax };
}

/**
 * Original purchase AP total / input tax from line stock (items not qty-mutated on returns).
 */
export function getOriginalPurchaseTotal(p, taxSettings) {
  taxSettings = taxSettings || {};
  var items = (p && p.items) || [];
  var invVal = purchaseInventoryVal(p);
  var taxIn = round2((p && p.totalTax) || 0);
  if (!items.length) {
    return { total: round2((p && p.total) || 0), tax: taxIn, invNet: invVal };
  }
  var inclusive = isPurchaseTaxInclusive(p, taxSettings);
  if (taxSettings.taxEnabled && taxIn > 0.005) {
    if (inclusive) {
      return {
        total: invVal,
        tax: taxIn,
        invNet: round2(Math.max(0, invVal - taxIn)),
      };
    }
    return { total: round2(invVal + taxIn), tax: taxIn, invNet: invVal };
  }
  return { total: invVal, tax: 0, invNet: invVal };
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
  chart = resolveGlChart(chart);
  var meta = {};
  chart.forEach(function (a) { meta[a.id] = a; });
  var bal = {};
  chart.forEach(function (a) {
    var s = sumAccount(lines, a.id);
    bal[a.id] = signedBalanceForAccount(meta[a.id], s.debit, s.credit);
  });
  return bal;
}

/** Empty [] must never blank Trial Balance / P&L when journal lines exist. */
export function resolveGlChart(chart) {
  return (Array.isArray(chart) && chart.length > 0) ? chart : DEFAULT_GL_CHART;
}

export function trialBalance(lines, chart) {
  chart = resolveGlChart(chart);
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

  function collapseDuplicateFullSalePayments(paymentHistory, total) {
    var list = Array.isArray(paymentHistory) ? paymentHistory : [];
    var t = round2(total || 0);
    if (t <= 0 || list.length < 2) return list;
    var fullIdx = [];
    for (var i = 0; i < list.length; i++) {
      if (Math.abs(round2(list[i] && list[i].amount || 0) - t) < 0.01) fullIdx.push(i);
    }
    if (fullIdx.length < 2) return list;
    var keep = {};
    keep[fullIdx[0]] = true;
    return list.filter(function (ph, idx) {
      var amt = round2(ph && ph.amount || 0);
      if (Math.abs(amt - t) < 0.01) return !!keep[idx];
      return true;
    });
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
    var partsOB = [];
    if (dCash > 0) partsOB.push({ accountId: GL.CASH, debit: dCash, credit: 0, memo: "Opening" });
    else if (dCash < 0) partsOB.push({ accountId: GL.CASH, debit: 0, credit: -dCash, memo: "Opening overdraft" });
    if (dBank > 0) partsOB.push({ accountId: GL.BANK, debit: dBank, credit: 0, memo: "Opening" });
    else if (dBank < 0) partsOB.push({ accountId: GL.BANK, debit: 0, credit: -dBank, memo: "Opening overdraft" });
    if (dRecv > 0) partsOB.push({ accountId: GL.AR, debit: dRecv, credit: 0, memo: "Opening receivables" });
    else if (dRecv < 0) partsOB.push({ accountId: GL.AR, debit: 0, credit: -dRecv, memo: "Opening AR credit" });
    if (dStock > 0) partsOB.push({ accountId: GL.INV, debit: dStock, credit: 0, memo: "Opening stock" });
    else if (dStock < 0) partsOB.push({ accountId: GL.INV, debit: 0, credit: -dStock, memo: "Opening stock credit" });
    if (dAst > 0) partsOB.push({ accountId: GL.FIXED, debit: dAst, credit: 0, memo: "Opening assets" });
    else if (dAst < 0) partsOB.push({ accountId: GL.FIXED, debit: 0, credit: -dAst, memo: "Opening asset credit" });
    if (dPay > 0) partsOB.push({ accountId: GL.AP, debit: 0, credit: dPay, memo: "Opening payables" });
    else if (dPay < 0) partsOB.push({ accountId: GL.AP, debit: -dPay, credit: 0, memo: "Opening AP debit (prepayment)" });
    var signedDr = (dCash > 0 ? dCash : 0) + (dBank > 0 ? dBank : 0) + (dRecv > 0 ? dRecv : 0) + (dStock > 0 ? dStock : 0) + (dAst > 0 ? dAst : 0) + (dPay < 0 ? -dPay : 0);
    var signedCr = (dPay > 0 ? dPay : 0) + (dCash < 0 ? -dCash : 0) + (dBank < 0 ? -dBank : 0) + (dRecv < 0 ? -dRecv : 0) + (dStock < 0 ? -dStock : 0) + (dAst < 0 ? -dAst : 0);
    var eq = round2(signedDr - signedCr);
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
    var capRef = e.id || ("capfb-" + String(dt) + "-" + String(amt) + "-" + idx);
    if (e.type === "invest") {
      add(dt, "capital", "cap-" + capRef, [
        { accountId: acc, debit: amt, credit: 0 },
        { accountId: GL.EQUITY, debit: 0, credit: amt },
      ], e.note || "Capital invest");
    } else {
      add(dt, "capital", "capw-" + capRef, [
        { accountId: GL.EQUITY, debit: amt, credit: 0 },
        { accountId: acc, debit: 0, credit: amt },
      ], e.note || "Capital withdraw");
    }
  });

  /* ── Sales (revenue + cash/AR + COGS; optional VAT split) ──
     Returns.jsx may reduce parent invoice totals; original totals come from item lines
     (items are not qty-mutated). Math.max restores mutated-down parents without double-counting
     when parent.total is already the pre-return amount (static tests). */
  var taxSettings = state.settings || {};
  var glVatPosting = taxSettings.glVatPostingEnabled !== false;
  (state.sales || []).forEach(function (s) {
    if (s.status === "Voided" || s.status === "Cancelled") return;
    var dt = s.date || "";
    var inv = cogsForSale(s);
    var origSale = getOriginalSaleTotalAndTax(s, taxSettings);
    var tot = (s.items && s.items.length)
      ? Math.max(round2(s.total || 0), origSale.total)
      : round2(s.total || 0);
    var parts = [];
    var taxAmt = (s.items && s.items.length)
      ? Math.max(round2(s.totalTax || 0), origSale.tax)
      : round2(s.totalTax || 0);
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
    /* Full invoice on AR at sale date; cash/bank settle on payment dates (separate journals). */
    parts.push({ accountId: GL.AR, debit: tot, credit: 0, memo: "Invoice " + (s.invoiceNo || "") });
    add(dt, "sale", s.id, parts, "Sale", "rev");
    var cashPhSum = 0;
    var arRemain = tot;
    var creditRemain = 0;
    collapseDuplicateFullSalePayments(s.paymentHistory || [], tot).forEach(function (ph, j) {
      var a = round2(ph.amount || 0);
      if (Math.abs(a) < 0.005) return;
      var m = ph.cashMethod || "Cash";
      if (m === "Cheque" || m === "Adjustment") return;
      cashPhSum = round2(cashPhSum + a);
      var payDt = ph.date || dt;
      if (a > 0) {
        var toAr = round2(Math.min(a, Math.max(0, arRemain)));
        var excess = round2(a - toAr);
        arRemain = round2(arRemain - toAr);
        creditRemain = round2(creditRemain + excess);
        if (toAr > 0.005) {
          add(payDt, "sale_payment", s.id + "-pay-" + j, [
            { accountId: cashBankFromMethod(m), debit: toAr, credit: 0, memo: ph.note || "Payment" },
            { accountId: GL.AR, debit: 0, credit: toAr },
          ], "Customer pay");
        }
        if (excess > 0.005) {
          add(payDt, "sale_overpay", s.id + "-over-" + j, [
            { accountId: cashBankFromMethod(m), debit: excess, credit: 0, memo: "Customer credit / overpayment" },
            { accountId: GL.CLEARING, debit: 0, credit: excess, memo: "Customer credit" },
          ], "Customer overpay");
        }
      } else {
        var refund = round2(-a);
        var fromCredit = round2(Math.min(refund, Math.max(0, creditRemain)));
        var fromAr = round2(refund - fromCredit);
        creditRemain = round2(creditRemain - fromCredit);
        arRemain = round2(arRemain + fromAr);
        if (fromCredit > 0.005) {
          add(payDt, "sale_overpay", s.id + "-overrev-" + j, [
            { accountId: GL.CLEARING, debit: fromCredit, credit: 0, memo: "Customer credit refund" },
            { accountId: cashBankFromMethod(m), debit: 0, credit: fromCredit },
          ], "Customer credit refund");
        }
        if (fromAr > 0.005) {
          add(payDt, "sale_payment", s.id + "-pay-" + j, [
            { accountId: GL.AR, debit: fromAr, credit: 0, memo: ph.note || "Payment reversal" },
            { accountId: cashBankFromMethod(m), debit: 0, credit: fromAr },
          ], "Customer payment reversal");
        }
      }
    });
    if (cashPhSum - tot > 0.005) {
      /* Designed CLEARING home for excess — informational only (must not block journal persist). */
    }
    if (inv > 0) {
      add(dt, "sale_cogs", s.id, [
        { accountId: GL.COGS, debit: inv, credit: 0 },
        { accountId: GL.INV, debit: 0, credit: inv },
      ], "COGS", "cogs");
    }
  });

  /* ── Purchases: inventory + AP (+ input VAT when recorded), then payments.
     Original AP from purchase lines (Returns.jsx may reduce parent.total). ── */
  (state.purchases || []).forEach(function (p, idx) {
    if (p.status === "Voided" || p.status === "Cancelled") return;
    var dt = p.date || "";
    var origPur = getOriginalPurchaseTotal(p, taxSettings);
    var apTot = (p.items && p.items.length)
      ? Math.max(round2(p.total || 0), origPur.total)
      : round2(p.total || 0);
    var taxIn = (p.items && p.items.length)
      ? Math.max(round2(p.totalTax || 0), origPur.tax)
      : round2(p.totalTax || 0);
    var invVal = purchaseInventoryVal(p);
    var invNet = round2(origPur.invNet != null ? origPur.invNet : invVal);
    var pp;
    var diff;
    if (glVatPosting && taxSettings.taxEnabled && taxIn > 0.005) {
      var baseSum = round2(invNet + taxIn);
      diff = round2(apTot - baseSum);
      pp = [
        { accountId: GL.INV, debit: invNet, credit: 0 },
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
    var apRemain = apTot;
    var prepayRemain = 0;
    (p.paymentHistory || []).forEach(function (ph, j) {
      var a = round2(ph.amount || 0);
      if (Math.abs(a) < 0.005) return;
      var m = ph.cashMethod || "Cash";
      /* Match sales path + getCashBalances: Cheque pending / Adjustment are not cash until Bank. */
      if (m === "Cheque" || m === "Adjustment") return;
      var payDt = ph.date || dt;
      if (a > 0) {
        var toAp = round2(Math.min(a, Math.max(0, apRemain)));
        var excessP = round2(a - toAp);
        apRemain = round2(apRemain - toAp);
        prepayRemain = round2(prepayRemain + excessP);
        if (toAp > 0.005) {
          add(payDt, "purchase_payment", p.id + "-pay-" + j, [
            { accountId: GL.AP, debit: toAp, credit: 0 },
            { accountId: cashBankFromMethod(m), debit: 0, credit: toAp },
          ], "Supplier pay");
        }
        if (excessP > 0.005) {
          add(payDt, "purchase_prepay", p.id + "-pre-" + j, [
            { accountId: GL.VENDOR_PREPAY, debit: excessP, credit: 0, memo: "Vendor prepayment" },
            { accountId: cashBankFromMethod(m), debit: 0, credit: excessP },
          ], "Vendor prepay");
        }
      } else if (a < 0) {
        var refundP = round2(-a);
        var fromPre = round2(Math.min(refundP, Math.max(0, prepayRemain)));
        var fromAp = round2(refundP - fromPre);
        prepayRemain = round2(prepayRemain - fromPre);
        apRemain = round2(apRemain + fromAp);
        if (fromPre > 0.005) {
          add(payDt, "purchase_prepay", p.id + "-prerev-" + j, [
            { accountId: cashBankFromMethod(m), debit: fromPre, credit: 0 },
            { accountId: GL.VENDOR_PREPAY, debit: 0, credit: fromPre, memo: "Vendor prepayment refund" },
          ], "Vendor prepay refund");
        }
        if (fromAp > 0.005) {
          add(payDt, "purchase_payment", p.id + "-pay-" + j, [
            { accountId: cashBankFromMethod(m), debit: fromAp, credit: 0 },
            { accountId: GL.AP, debit: 0, credit: fromAp },
          ], "Supplier payment reversal");
        }
      }
    });
  });

  /* ── Expenses (ChequePending waits until cheque clear posts Bank) ── */
  (state.expenses || []).forEach(function (e) {
    if (e.cashMethod === "ChequePending") return;
    var dt = e.clearedDate || e.date || "";
    var amt = round2(e.amount || 0);
    if (amt <= 0) return;
    var acc = cashBankFromMethod(e.cashMethod || (e.payMode === "Bank Transfer" || e.payMode === "Online" || e.payMode === "Cheque" ? "Bank" : "Cash"));
    add(dt, "expense", e.id, [
      { accountId: GL.EXP, debit: amt, credit: 0, memo: e.category || e.type || "" },
      { accountId: acc, debit: 0, credit: amt },
    ], e.note || e.description || "Expense");
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
        if (a > 0) {
          add(ph.date || "", "manual_payable_pay", mp.id + "-ph-" + j, [
            { accountId: GL.AP, debit: a, credit: 0 },
            { accountId: cashBankFromMethod(ph.cashMethod), debit: 0, credit: a },
          ], "Pay loan");
        } else if (a < 0) {
          add(ph.date || "", "manual_payable_pay", mp.id + "-ph-" + j, [
            { accountId: cashBankFromMethod(ph.cashMethod), debit: -a, credit: 0 },
            { accountId: GL.AP, debit: 0, credit: -a },
          ], "Loan payment reversal");
        }
      });
      return;
    }
    var amt = round2(mp.amount || 0);
    if (amt <= 0) return;
    var invLinked = !!(mp && mp.productId);
    add(mp.date || "", "manual_payable", mp.id, [
      { accountId: invLinked ? GL.INV : cashBankFromMethod(mp.paymentMethod), debit: amt, credit: 0, memo: invLinked ? "Inventory inflow via payable" : "Borrowed" },
      { accountId: GL.AP, debit: 0, credit: amt },
    ], mp.source || "Manual payable");
    (mp.paymentHistory || []).forEach(function (ph, j) {
      var a = round2(ph.amount || 0);
      if (a > 0) {
        add(ph.date || "", "manual_payable_pay", mp.id + "-ph-" + j, [
          { accountId: GL.AP, debit: a, credit: 0 },
          { accountId: cashBankFromMethod(ph.cashMethod), debit: 0, credit: a },
        ], "Repay");
      } else if (a < 0) {
        add(ph.date || "", "manual_payable_pay", mp.id + "-ph-" + j, [
          { accountId: cashBankFromMethod(ph.cashMethod), debit: -a, credit: 0 },
          { accountId: GL.AP, debit: 0, credit: -a },
        ], "Repay reversal");
      }
    });
  });

  (S.get("tc3_manualReceivables", []) || []).forEach(function (mr) {
    if (mr._isOpening) {
      (mr.paymentHistory || []).forEach(function (ph, j) {
        var a = round2(ph.amount || 0);
        if (a > 0) {
          add(ph.date || "", "manual_receivable_coll", mr.id + "-ph-" + j, [
            { accountId: cashBankFromMethod(ph.cashMethod), debit: a, credit: 0 },
            { accountId: GL.AR, debit: 0, credit: a },
          ], "Collect");
        } else if (a < 0) {
          add(ph.date || "", "manual_receivable_coll", mr.id + "-ph-" + j, [
            { accountId: GL.AR, debit: -a, credit: 0 },
            { accountId: cashBankFromMethod(ph.cashMethod), debit: 0, credit: -a },
          ], "Collection reversal");
        }
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
      if (a > 0) {
        add(ph.date || "", "manual_receivable_coll", mr.id + "-ph-" + j, [
          { accountId: cashBankFromMethod(ph.cashMethod), debit: a, credit: 0 },
          { accountId: GL.AR, debit: 0, credit: a },
        ], "Collect");
      } else if (a < 0) {
        add(ph.date || "", "manual_receivable_coll", mr.id + "-ph-" + j, [
          { accountId: GL.AR, debit: -a, credit: 0 },
          { accountId: cashBankFromMethod(ph.cashMethod), debit: 0, credit: -a },
        ], "Collect reversal");
      }
    });
  });

  var salesById = {};
  (state.sales || []).forEach(function (s) {
    if (s && s.id != null) salesById[s.id] = s;
  });
  var purchasesById = {};
  (state.purchases || []).forEach(function (p) {
    if (p && p.id != null) purchasesById[p.id] = p;
  });

  /* ── Sales returns (contra revenue + output VAT reversal + AR; COGS reversal).
     Cash/bank refunds are posted only via the parent sale paymentHistory (negative PH),
     never again from return.refundAmount — avoids double cash credit. ── */
  (state.salesReturns || []).forEach(function (r) {
    var parentSale = r.invoiceId != null ? salesById[r.invoiceId] : null;
    /* Quarantine orphan / voided-parent returns — matches report activeSalesReturns policy. */
    if (!isReturnParentEconomicallyActive(parentSale)) return;
    var dt = r.date || "";
    var rowNet = round2(r.amount || 0);
    var cost = round2(round2(r.cost || 0) * (r.qty || 0));
    if (rowNet > 0 || (r.returnGross != null && Number(r.returnGross) > 0)) {
      var sale = r.invoiceId != null ? salesById[r.invoiceId] : null;
      var rt = computeReturnLineTax(sale, taxSettings, rowNet, {
        returnTax: r.returnTax,
        returnGross: r.returnGross,
        amountIsNet: r.returnGross != null && r.returnGross !== "",
        selectedTaxes: r.selectedTaxes,
        taxMode: r.taxMode,
      });
      rowNet = round2(rt.net);
      var taxOnReturn = round2(rt.totalTax);
      var grossReturn = round2(rt.gross);
      var parts = [{ accountId: GL.SRET, debit: rowNet, credit: 0, memo: "Return" }];
      if (glVatPosting && taxSettings.taxEnabled && taxOnReturn > 0.005) {
        parts.push({ accountId: GL.VAT_PAY, debit: taxOnReturn, credit: 0, memo: "Output VAT reversal" });
      }
      if (grossReturn > 0.005) {
        /* Orphan return (no parent invoice): CLEARING — avoids AR subledger hard-fail. */
        var arAcct = (sale || parentSale) ? GL.AR : GL.CLEARING;
        parts.push({
          accountId: arAcct,
          debit: 0,
          credit: grossReturn,
          memo: arAcct === GL.AR ? "Reduce receivable / on account" : "Orphan return · customer credit clearing",
        });
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

  /* ── Purchase returns — inventory credit prefers layer/WAC replay from invDer
     (same idea as sale COGS). Supplier AP still uses commercial return amount;
     any gap posts to PUR_VAR so INV stays aligned with the inventory engine. ── */
  (state.purchaseReturns || []).forEach(function (r) {
    var parentPurchase = r.purchaseId != null ? purchasesById[r.purchaseId] : null;
    if (!isReturnParentEconomicallyActive(parentPurchase)) return;
    var dt = r.date || "";
    var costCommercial = round2(round2(r.cost || 0) * (r.qty || 0));
    var cost = costCommercial;
    if (invDer && invDer.invOutByPurchaseReturnId && invDer.invOutByPurchaseReturnId[r.id] != null) {
      cost = round2(invDer.invOutByPurchaseReturnId[r.id]);
    }
    if (costCommercial > 0 || cost > 0) {
      var purchase = r.purchaseId != null ? purchasesById[r.purchaseId] : null;
      var taxRev = 0;
      var apGross = costCommercial > 0 ? costCommercial : cost;
      var invCredit = cost > 0 ? cost : costCommercial;
      if (glVatPosting && taxSettings.taxEnabled) {
        if (r.returnGross != null && r.returnGross !== "" && !isNaN(Number(r.returnGross))) {
          apGross = round2(Number(r.returnGross));
          taxRev = r.returnTax != null && r.returnTax !== "" && !isNaN(Number(r.returnTax))
            ? round2(Number(r.returnTax))
            : 0;
          /* Prefer engine stock cost when present; else net of tax on commercial gross. */
          if (!(invDer && invDer.invOutByPurchaseReturnId && invDer.invOutByPurchaseReturnId[r.id] != null)) {
            invCredit = round2(apGross - taxRev);
          }
        } else if (r.returnTax != null && r.returnTax !== "" && !isNaN(Number(r.returnTax))) {
          taxRev = round2(Number(r.returnTax));
          apGross = round2(costCommercial + taxRev);
        } else {
          var prt = computePurchaseReturnTax(purchase, costCommercial > 0 ? costCommercial : cost, taxSettings);
          taxRev = round2(prt.taxReversal);
          apGross = round2(prt.apGross);
          if (!(invDer && invDer.invOutByPurchaseReturnId && invDer.invOutByPurchaseReturnId[r.id] != null)) {
            invCredit = round2(prt.stockCost);
          }
        }
      }
      var prParts = [
        {
          accountId: (purchase || parentPurchase) ? GL.AP : GL.CLEARING,
          debit: apGross,
          credit: 0,
          memo: (purchase || parentPurchase) ? undefined : "Orphan PR · supplier clearing",
        },
        { accountId: GL.INV, debit: 0, credit: invCredit },
      ];
      if (taxRev > 0.005) {
        prParts.push({ accountId: GL.VAT_REC, debit: 0, credit: taxRev, memo: "Input VAT reversal" });
      }
      var prPlug = round2(apGross - invCredit - taxRev);
      if (Math.abs(prPlug) > 0.005) {
        if (prPlug > 0) {
          prParts.push({ accountId: GL.PUR_VAR, debit: 0, credit: prPlug, memo: "PR cost vs layer/WAC" });
        } else {
          prParts.push({ accountId: GL.PUR_VAR, debit: -prPlug, credit: 0, memo: "PR cost vs layer/WAC" });
        }
      }
      add(dt, "purchase_return", r.id, prParts, "PR");
    }
  });

  /* ── Profit distribution ── */
  (S.get("tc3_profitDist", []) || []).forEach(function (pd, idx) {
    var amt = round2(pd.amount || 0);
    if (amt <= 0) return;
    var acc = cashBankFromMethod(pd.paymentMethod);
    var pdRef = pd.id || ("pdfb-" + String(pd.date || "") + "-" + String(amt) + "-" + idx);
    add(pd.date || "", "profit_dist", "pd-" + pdRef, [
      { accountId: GL.DRAW, debit: amt, credit: 0 },
      { accountId: acc, debit: 0, credit: amt },
    ], pd.note || "Distribution");
  });

  /* ═══════════════════════════════════════════════════════════════════
   * COD LOCKED SEPARATE (product request) — DO NOT POST TO GL
   * tc3_codWithdrawals / partner pools / COD “profit” are a parallel
   * tracker only. Never Dr/Cr Cash, Bank, Drawings, or P&L for COD
   * withdrawals or COD fund math. The POS sale still journals as usual;
   * this COD layer must stay isolated.
   * ═══════════════════════════════════════════════════════════════════ */

  /* ── Cleared standalone cheques (no invoice link) → bank / clearing ── */
  (state.cheques || []).forEach(function (ch) {
    if (!ch) return;
    var amt = round2(ch.amount || 0);
    if (amt <= 0) return;
    var isStandalone = !(ch.saleId || ch.purchaseId || ch.manualPayableId || ch.manualReceivableId || ch.expenseId);
    if (!isStandalone) return;

    /* Voided after clear: reverse allocations (AR↔CLEARING) then bank ↔ clearing. */
    if (String(ch.status || "") === "Voided" && String(ch.priorStatus || "") === "Cleared") {
      var vdt = ch.voidedDate || ch.clearedDate || ch.date || "";
      if (ch.type === "incoming") {
        (ch.allocations || []).forEach(function (al, ai) {
          if (!al || !al.saleId) return;
          var aa = round2(al.amount || 0);
          if (aa <= 0.005) return;
          add(al.date || vdt, "cheque_alloc_void", ch.id + "-av" + ai, [
            { accountId: GL.AR, debit: aa, credit: 0, memo: "Reverse cheque allocation" },
            { accountId: GL.CLEARING, debit: 0, credit: aa, memo: "Restore clearing" },
          ], "Unallocate #" + (ch.chequeNo || ""));
        });
        add(vdt, "standalone_cheque_void", ch.id, [
          { accountId: GL.CLEARING, debit: amt, credit: 0, memo: "Reverse cleared receipt" },
          { accountId: GL.BANK, debit: 0, credit: amt },
        ], "Void standalone in #" + (ch.chequeNo || ""));
      } else if (ch.type === "outgoing") {
        add(vdt, "standalone_cheque_void", ch.id, [
          { accountId: GL.BANK, debit: amt, credit: 0 },
          { accountId: GL.EXP, debit: 0, credit: amt, memo: "Reverse standalone cheque" },
        ], "Void standalone out #" + (ch.chequeNo || ""));
      }
      return;
    }

    if (String(ch.status || "") !== "Cleared") return;
    var dt = ch.clearedDate || ch.date || "";
    if (ch.type === "incoming") {
      add(dt, "standalone_cheque", ch.id, [
        { accountId: GL.BANK, debit: amt, credit: 0 },
        { accountId: GL.CLEARING, debit: 0, credit: amt, memo: "Standalone cheque clear — allocate later" },
      ], "Standalone in #" + (ch.chequeNo || ""));
      /* Allocations: Dr CLEARING / Cr AR (invoice) — Bank already posted on clear. */
      var allocated = 0;
      (ch.allocations || []).forEach(function (al, ai) {
        if (!al) return;
        var aa = round2(al.amount || 0);
        if (aa <= 0.005) return;
        allocated = round2(allocated + aa);
        var adt = al.date || dt;
        if (al.saleId) {
          add(adt, "cheque_alloc", ch.id + "-a" + ai, [
            { accountId: GL.CLEARING, debit: aa, credit: 0, memo: "Allocate to invoice" },
            { accountId: GL.AR, debit: 0, credit: aa, memo: "Customer receipt allocation" },
          ], "Allocate #" + (ch.chequeNo || ""));
        } else {
          /* Keep as customer credit in CLEARING — no further entry needed. */
        }
      });
      if (allocated - amt > 0.02) {
        warnings.push("Cheque #" + (ch.chequeNo || ch.id) + ": allocations exceed amount");
      }
    } else if (ch.type === "outgoing") {
      add(dt, "standalone_cheque", ch.id, [
        { accountId: GL.EXP, debit: amt, credit: 0, memo: "Standalone cheque" },
        { accountId: GL.BANK, debit: 0, credit: amt },
      ], "Standalone out #" + (ch.chequeNo || ""));
    }
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

  /* Damage write-offs from inventory replay movements */
  var damageByDate = {};
  if (invDer && Array.isArray(invDer.movements)) {
    invDer.movements.forEach(function (mv) {
      if (!mv || mv.referenceType !== "damage") return;
      var tc = mv.totalCost != null ? round2(mv.totalCost) : round2((mv.qtyOut || 0) * round2(mv.unitCost || 0));
      if (!(tc > 0.0001)) return;
      var d = String(mv.date || "");
      damageByDate[d] = round2((damageByDate[d] || 0) + tc);
    });
  }
  Object.keys(damageByDate).sort(function (a, b) {
    return String(a).localeCompare(String(b));
  }).forEach(function (d) {
    var amt = damageByDate[d];
    if (amt > 0.0001) {
      add(d, "damage", "damage_" + d, [
        { accountId: GL.DAMAGE, debit: amt, credit: 0, memo: "Damage write-off" },
        { accountId: GL.INV, debit: 0, credit: amt, memo: "Inventory written off" },
      ], "Inventory damage · " + d, "damage");
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
  chart = resolveGlChart(chart);
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
  chart = resolveGlChart(chart);
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
    if (a.type === "equity") {
      /* Debit-normal equity (drawings / distributions) reduces owners' equity. */
      eq += (a.normal === "debit") ? -bal : bal;
    }
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
