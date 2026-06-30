/**
 * POS / quotation / invoice tax amounts.
 * Caller passes the correct taxable base:
 * - After discount (default): taxableNet = subtotal − discount.
 * - Before discount (exclusive, Settings → taxApplyBase): pass subtotal; POS sets grand total = subtotal − discount + tax.
 */

import { normalizeTaxList } from "./countryTaxMeta.js";
import { deriveLineStockValue } from "../utils/purchaseValuation.js";

function roundMoney(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

function taxRowsForCompute(settings) {
  var list = normalizeTaxList(settings && settings.selectedTaxes || []).filter(function (t) {
    return t.enabled !== false;
  });
  return list.map(function (t, idx) {
    return {
      name: t.name,
      rate: typeof t.rate === "number" ? t.rate : parseFloat(t.rate) || 0,
      enabled: true,
      order: typeof t.order === "number" ? t.order : idx,
      appliesOn: t.appliesOn === "running" ? "running" : "net",
    };
  }).sort(function (a, b) {
    return (a.order || 0) - (b.order || 0);
  });
}

function isCascadeTaxMode(settings) {
  return !!(settings && settings.taxCompoundMode === "cascade");
}

function computeExclusiveTaxLines(rows, taxableNet, cascade) {
  var G = Math.max(0, taxableNet);
  var lines = [];
  var totalTax = 0;
  var running = G;
  rows.forEach(function (t) {
    var r = Math.max(0, t.rate || 0);
    var base = cascade && t.appliesOn === "running" ? running : G;
    var amt = roundMoney(base * (r / 100));
    totalTax = roundMoney(totalTax + amt);
    if (cascade) running = roundMoney(running + amt);
    lines.push({ name: t.name, rate: r, amount: amt, appliesOn: t.appliesOn });
  });
  return { lines: lines, totalTax: totalTax, grandTotal: roundMoney(G + totalTax) };
}

function computeInclusiveCompoundTaxLines(rows, gross) {
  var G = Math.max(0, gross);
  if (G <= 0 || !rows.length) return { lines: [], totalTax: 0, grandTotal: G };
  var net = G;
  var taxParts = [];
  rows.forEach(function (t) {
    var r = Math.max(0, t.rate || 0) / 100;
    if (r <= 0) {
      taxParts.push(0);
      return;
    }
    if (t.appliesOn === "running") {
      var prevTax = taxParts.reduce(function (a, x) { return a + x; }, 0);
      var base = net + prevTax;
      taxParts.push(roundMoney(base - base / (1 + r)));
    } else {
      taxParts.push(roundMoney(net - net / (1 + r)));
    }
  });
  var totalTax = roundMoney(taxParts.reduce(function (a, x) { return a + x; }, 0));
  var lines = rows.map(function (t, idx) {
    return { name: t.name, rate: t.rate, amount: roundMoney(taxParts[idx] || 0), appliesOn: t.appliesOn };
  });
  return { lines: lines, totalTax: totalTax, grandTotal: G };
}

/**
 * @param {object} settings - app settings (taxEnabled, taxMode, selectedTaxes)
 * @param {number} taxableNet - subtotal minus discount, >= 0
 * @returns { applied, taxMode, selectedTaxes: [{name, rate, amount}], totalTax, grandTotal }
 */
export function computeSaleTax(settings, taxableNet) {
  var G = Math.max(0, typeof taxableNet === "number" ? taxableNet : parseFloat(taxableNet) || 0);
  var mode = settings && settings.taxMode === "inclusive" ? "inclusive" : "exclusive";
  if (!settings || !settings.taxEnabled) {
    return {
      applied: false,
      taxMode: mode,
      selectedTaxes: [],
      totalTax: 0,
      grandTotal: G,
    };
  }
  var list = taxRowsForCompute(settings);
  if (!list.length) {
    return {
      applied: true,
      taxMode: mode,
      selectedTaxes: [],
      totalTax: 0,
      grandTotal: G,
      taxCompoundMode: isCascadeTaxMode(settings) ? "cascade" : "parallel",
    };
  }
  var cascade = isCascadeTaxMode(settings) && mode === "exclusive";
  var lines = [];
  var totalTax = 0;
  if (mode === "exclusive") {
    var ex = computeExclusiveTaxLines(list, G, cascade);
    return {
      applied: true,
      taxMode: mode,
      selectedTaxes: ex.lines,
      totalTax: ex.totalTax,
      grandTotal: ex.grandTotal,
      taxCompoundMode: cascade ? "cascade" : "parallel",
    };
  }
  if (isCascadeTaxMode(settings)) {
    var incCascade = computeInclusiveCompoundTaxLines(list, G);
    return {
      applied: true,
      taxMode: mode,
      selectedTaxes: incCascade.lines,
      totalTax: incCascade.totalTax,
      grandTotal: incCascade.grandTotal,
      taxCompoundMode: "cascade",
    };
  }
  /* inclusive parallel: combined effective rate, then split tax across lines by relative rates */
  var combinedRate = list.reduce(function (a, t) {
    var r = typeof t.rate === "number" ? t.rate : parseFloat(t.rate) || 0;
    return a + Math.max(0, r);
  }, 0);
  var totalTaxInclusive =
    combinedRate <= 0 ? 0 : roundMoney(G - G / (1 + combinedRate / 100));
  var allocated = 0;
  list.forEach(function (t, idx) {
    var r = typeof t.rate === "number" ? t.rate : parseFloat(t.rate) || 0;
    var rr = Math.max(0, r);
    var amt;
    if (combinedRate <= 0) {
      amt = 0;
    } else if (idx < list.length - 1) {
      amt = roundMoney(totalTaxInclusive * (rr / combinedRate));
      allocated = roundMoney(allocated + amt);
    } else {
      amt = roundMoney(totalTaxInclusive - allocated);
    }
    lines.push({ name: t.name, rate: r, amount: amt });
  });
  totalTax = roundMoney(lines.reduce(function (a, L) { return a + L.amount; }, 0));
  return {
    applied: true,
    taxMode: mode,
    selectedTaxes: lines,
    totalTax: totalTax,
    grandTotal: G,
    taxCompoundMode: "parallel",
  };
}

/**
 * Persisted sale lines use { name, rate, amount }; recompute when only net changes (e.g. returns).
 */
export function computeSaleTaxFromSnapshot(sale, newTaxableNet) {
  var hasTaxMeta = sale && ((sale.totalTax > 0) || (sale.selectedTaxes && sale.selectedTaxes.length > 0));
  if (!hasTaxMeta) {
    return computeSaleTax({ taxEnabled: false }, newTaxableNet);
  }
  var rates = (sale.selectedTaxes || []).map(function (t, idx) {
    return {
      name: t.name,
      rate: t.rate,
      enabled: true,
      custom: !!t.custom,
      order: typeof t.order === "number" ? t.order : idx,
      appliesOn: t.appliesOn === "running" ? "running" : "net",
    };
  });
  return computeSaleTax(
    {
      taxEnabled: true,
      taxMode: sale.taxMode === "inclusive" ? "inclusive" : "exclusive",
      taxCompoundMode: sale.taxCompoundMode || "parallel",
      selectedTaxes: rates,
    },
    newTaxableNet
  );
}

function isInclusiveTaxMode(sale, settings) {
  if (sale && sale.taxMode === "inclusive") return true;
  if (sale && sale.taxMode === "exclusive") return false;
  return !!(settings && settings.taxMode === "inclusive");
}

function purchaseInventoryGross(purchase) {
  return roundMoney((purchase && purchase.items || []).reduce(function (a, it) {
    return a + deriveLineStockValue(it);
  }, 0));
}

/** True when purchase line costs are tax-inclusive (stored taxMode or legacy AP ≈ gross lines). */
export function isPurchaseTaxInclusive(purchase, settings) {
  if (!purchase) return false;
  if (purchase.taxMode === "inclusive") return true;
  if (purchase.taxMode === "exclusive") return false;
  if (!settings || !settings.taxEnabled) return false;
  var taxIn = roundMoney(purchase.totalTax || 0);
  if (taxIn <= 0.005) return false;
  var invGross = purchaseInventoryGross(purchase);
  var apTot = roundMoney(purchase.total || 0);
  if (invGross <= 0) return false;
  /* Legacy rows: AP matches gross stock total — VAT is embedded in line costs. */
  if (Math.abs(apTot - invGross) <= 0.02) return true;
  return settings.taxMode === "inclusive";
}

/**
 * Split purchase stock value into inventory (net) and input VAT for GL / WAC replay.
 * Exclusive: invNet + taxIn should equal AP. Inclusive: line costs are gross; taxIn is VAT inside gross.
 */
export function computePurchaseInventoryPosting(purchase, settings) {
  var invGross = purchaseInventoryGross(purchase);
  var taxIn = roundMoney(purchase && purchase.totalTax || 0);
  var apTot = roundMoney(purchase && purchase.total || 0);
  var inclusive = isPurchaseTaxInclusive(purchase, settings);
  if (!settings || !settings.taxEnabled || taxIn <= 0.005) {
    return { invGross: invGross, invNet: invGross, taxIn: 0, apTot: apTot, inclusive: inclusive };
  }
  if (inclusive) {
    if (taxIn <= 0.005 && invGross > 0) {
      taxIn = roundMoney(computeSaleTax(settings, invGross).totalTax || 0);
    }
    var invNet = roundMoney(Math.max(0, invGross - taxIn));
    return { invGross: invGross, invNet: invNet, taxIn: taxIn, apTot: apTot, inclusive: true };
  }
  return { invGross: invGross, invNet: invGross, taxIn: taxIn, apTot: apTot, inclusive: false };
}

/** Scale factor to convert tax-inclusive purchase line unit costs to tax-exclusive inventory costs. */
export function purchaseInventoryNetFactor(purchase, settings) {
  var posting = computePurchaseInventoryPosting(purchase, settings);
  if (!posting.inclusive || posting.invGross <= 0.005) return 1;
  return roundMoney(posting.invNet / posting.invGross);
}

function syntheticSaleFromReturnOpts(opts) {
  if (!opts) return null;
  var taxes = opts.selectedTaxes;
  if (!taxes || !taxes.length) return null;
  var hasTaxMeta = (opts.returnTax > 0) || taxes.length > 0;
  if (!hasTaxMeta) return null;
  return {
    totalTax: opts.returnTax || 0,
    taxMode: opts.taxMode === "inclusive" ? "inclusive" : opts.taxMode === "exclusive" ? "exclusive" : undefined,
    selectedTaxes: taxes.map(function (t) {
      return { name: t.name, rate: t.rate, amount: t.amount, custom: !!t.custom };
    }),
  };
}

/**
 * Split a sales-return line into net / tax / gross for GL posting.
 * Exclusive: lineAmount is net (qty × unit price before tax).
 * Inclusive: lineAmount is tax-inclusive gross unless opts.amountIsNet (normalized rows).
 */
export function computeReturnLineTax(sale, settings, lineAmount, opts) {
  opts = opts || {};
  var raw = Math.max(0, roundMoney(lineAmount));
  if (raw <= 0 && !(opts.returnGross > 0)) return { net: 0, totalTax: 0, gross: 0 };

  var storedTax = opts.returnTax != null && opts.returnTax !== "" && !isNaN(Number(opts.returnTax))
    ? roundMoney(Number(opts.returnTax))
    : null;
  var storedGross = opts.returnGross != null && opts.returnGross !== "" && !isNaN(Number(opts.returnGross))
    ? roundMoney(Number(opts.returnGross))
    : null;
  var taxSnapshotSale = sale || syntheticSaleFromReturnOpts(opts);

  if (storedGross != null) {
    var g = storedGross;
    var t = storedTax != null ? storedTax : 0;
    if (t <= 0) {
      if (taxSnapshotSale && ((taxSnapshotSale.totalTax > 0) || (taxSnapshotSale.selectedTaxes && taxSnapshotSale.selectedTaxes.length > 0))) {
        t = roundMoney(computeSaleTaxFromSnapshot(taxSnapshotSale, g).totalTax || 0);
      } else if (storedTax == null) {
        return { net: g, totalTax: 0, gross: g };
      }
    }
    return { net: roundMoney(g - t), totalTax: t, gross: g };
  }

  var inclusive = isInclusiveTaxMode(taxSnapshotSale, settings);
  if (opts.taxMode === "inclusive") inclusive = true;
  if (opts.taxMode === "exclusive") inclusive = false;

  if (inclusive) {
    if (opts.amountIsNet === true && storedTax != null) {
      return { net: raw, totalTax: storedTax, gross: roundMoney(raw + storedTax) };
    }
    var gross = raw;
    var tcInc;
    if (taxSnapshotSale && ((taxSnapshotSale.totalTax > 0) || (taxSnapshotSale.selectedTaxes && taxSnapshotSale.selectedTaxes.length > 0))) {
      tcInc = computeSaleTaxFromSnapshot(taxSnapshotSale, gross);
    } else if (storedTax != null) {
      return { net: roundMoney(gross - storedTax), totalTax: storedTax, gross: gross };
    } else {
      return { net: gross, totalTax: 0, gross: gross };
    }
    var taxInc = storedTax != null ? storedTax : roundMoney(tcInc.totalTax || 0);
    return { net: roundMoney(gross - taxInc), totalTax: taxInc, gross: gross };
  }

  var net = raw;
  if (taxSnapshotSale && ((taxSnapshotSale.totalTax > 0) || (taxSnapshotSale.selectedTaxes && taxSnapshotSale.selectedTaxes.length > 0))) {
    var tcEx = computeSaleTaxFromSnapshot(taxSnapshotSale, net);
    var taxEx = storedTax != null ? storedTax : roundMoney(tcEx.totalTax || 0);
    return { net: net, totalTax: taxEx, gross: roundMoney(net + taxEx) };
  }
  if (storedTax != null) {
    return { net: net, totalTax: storedTax, gross: roundMoney(net + storedTax) };
  }
  return { net: net, totalTax: 0, gross: net };
}

/**
 * Input-VAT reversal and AP gross for a purchase return (pro-rata on stock cost returned).
 */
export function computePurchaseReturnTax(purchase, returnStockCost, settings) {
  var cost = Math.max(0, roundMoney(returnStockCost));
  if (!purchase || cost <= 0) return { stockCost: cost, taxReversal: 0, apGross: cost };
  var posting = computePurchaseInventoryPosting(purchase, settings || {});
  var taxIn = posting.taxIn;
  if (taxIn <= 0) return { stockCost: cost, taxReversal: 0, apGross: cost };
  var invBase = posting.inclusive ? posting.invNet : posting.invGross;
  if (invBase <= 0) return { stockCost: cost, taxReversal: 0, apGross: cost };
  var stockNet = posting.inclusive ? cost : cost;
  var taxRev = roundMoney(taxIn * (stockNet / invBase));
  return { stockCost: stockNet, taxReversal: taxRev, apGross: roundMoney(stockNet + taxRev) };
}
