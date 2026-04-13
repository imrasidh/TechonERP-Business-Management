/**
 * POS / quotation / invoice tax amounts.
 * Caller passes the correct taxable base:
 * - After discount (default): taxableNet = subtotal − discount.
 * - Before discount (exclusive, Settings → taxApplyBase): pass subtotal; POS sets grand total = subtotal − discount + tax.
 */

import { normalizeTaxList } from "./countryTaxMeta.js";

function roundMoney(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
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
  var list = normalizeTaxList(settings.selectedTaxes || []).filter(function (t) {
    return t.enabled !== false;
  });
  if (!list.length) {
    return {
      applied: true,
      taxMode: mode,
      selectedTaxes: [],
      totalTax: 0,
      grandTotal: G,
    };
  }
  var lines = [];
  var totalTax = 0;
  if (mode === "exclusive") {
    list.forEach(function (t) {
      var r = typeof t.rate === "number" ? t.rate : parseFloat(t.rate) || 0;
      var amt = roundMoney(G * (r / 100));
      totalTax = roundMoney(totalTax + amt);
      lines.push({ name: t.name, rate: r, amount: amt });
    });
    return {
      applied: true,
      taxMode: mode,
      selectedTaxes: lines,
      totalTax: totalTax,
      grandTotal: roundMoney(G + totalTax),
    };
  }
  /* inclusive: combined effective rate, then split tax across lines by relative rates */
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
  var rates = (sale.selectedTaxes || []).map(function (t) {
    return { name: t.name, rate: t.rate, enabled: true, custom: !!t.custom };
  });
  return computeSaleTax(
    { taxEnabled: true, taxMode: sale.taxMode === "inclusive" ? "inclusive" : "exclusive", selectedTaxes: rates },
    newTaxableNet
  );
}
