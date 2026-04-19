/**
 * Purchase line stock valuation: qty is always base (storage) units;
 * cost is always per base unit; lineStockValue preserves exact economic total.
 */
import { isProductBaseUnitLabel, factorForNamedUnit } from "../units/productUnits.js";

export var COST_INPUT_PER_INPUT = "per_input_unit";
export var COST_INPUT_PER_BASE = "per_base_unit";

export function defaultCostInputMode(product, inputUnit) {
  if (!product) return COST_INPUT_PER_BASE;
  return isProductBaseUnitLabel(product, inputUnit || product.unit || "Pcs") ? COST_INPUT_PER_BASE : COST_INPUT_PER_INPUT;
}

/**
 * From purchase entry fields: computes base qty, per-base cost, line total, and effective cost input mode.
 */
export function normalizePurchaseLineEconomics(inputQty, inputUnit, enteredCost, product, toProductBaseQty, costInputMode) {
  var iq = Number(inputQty) || 0;
  var ec = Number(enteredCost) || 0;
  if (!product || typeof toProductBaseQty !== "function") {
    return {
      baseQty: Math.max(0, iq),
      unitCostBase: Math.round(ec * 10000) / 10000,
      lineStockValue: Math.round(iq * ec * 100) / 100,
      costInputMode: COST_INPUT_PER_BASE,
    };
  }
  var iu = inputUnit || product.unit || "Pcs";
  var mode = costInputMode;
  if (!mode || (mode !== COST_INPUT_PER_INPUT && mode !== COST_INPUT_PER_BASE)) {
    mode = defaultCostInputMode(product, iu);
  }
  var baseQty = Math.round(toProductBaseQty(iq, iu, product) * 1000000) / 1000000;
  baseQty = Math.max(0, baseQty);
  var lineStockValue = 0;
  var unitCostBase = 0;
  if (mode === COST_INPUT_PER_BASE) {
    unitCostBase = Math.round(ec * 10000) / 10000;
    lineStockValue = Math.round(baseQty * unitCostBase * 100) / 100;
  } else {
    lineStockValue = Math.round(iq * ec * 100) / 100;
    unitCostBase = baseQty > 0 ? Math.round((lineStockValue / baseQty) * 10000) / 10000 : 0;
  }
  return {
    baseQty: baseQty,
    unitCostBase: unitCostBase,
    lineStockValue: lineStockValue,
    costInputMode: mode,
  };
}

/**
 * Economic line total (money) for stock received — used when normalizing lines with product context.
 * Prefer persisted lineStockValue (backward compatibility).
 */
export function lineEconomicValue(it, product, toProductBaseQty) {
  if (it == null) return 0;
  if (it.lineStockValue != null && it.lineStockValue !== "") {
    var stored = Number(it.lineStockValue);
    if (isFinite(stored)) return stored;
  }
  if (!product || typeof toProductBaseQty !== "function") {
    return Math.round((Number(it.qty) || 0) * (Number(it.cost) || 0) * 100) / 100;
  }
  var iu = it.inputUnit || it.unit || product.unit || "Pcs";
  var iq = it.inputQty !== undefined ? Number(it.inputQty) : NaN;
  var bq = Math.max(0, Number(it.qty) || 0);
  var ec = Number(it.cost) || 0;
  if (!isFinite(ec)) ec = 0;
  var mode = it.costInputMode;
  if (!mode || (mode !== COST_INPUT_PER_INPUT && mode !== COST_INPUT_PER_BASE)) {
    if (
      typeof console !== "undefined" &&
      console.warn &&
      !it.costInputMode &&
      (it.lineStockValue == null || it.lineStockValue === "")
    ) {
      var facChk = factorForNamedUnit(product, iu);
      if (facChk != null && facChk > 1 && !isProductBaseUnitLabel(product, iu)) {
        console.warn("[TechonERP purchase] Line missing costInputMode and lineStockValue for unit \"" + iu + "\" (factor " + facChk + "). Using legacy inference.");
      }
    }
    mode = defaultCostInputMode(product, iu);
  }

  if (mode === COST_INPUT_PER_BASE) {
    if (bq <= 0 && isFinite(iq) && iq > 0) {
      bq = Math.round(toProductBaseQty(iq, iu, product) * 1000000) / 1000000;
    }
    return Math.round(bq * ec * 100) / 100;
  }

  /* per_input_unit: entered cost is per purchase unit (only valid before cost is rewritten to per-base in UI; see normalize always setting lineStockValue) */
  if (mode === COST_INPUT_PER_INPUT && isFinite(iq) && iq > 0) {
    return Math.round(iq * ec * 100) / 100;
  }

  /* Legacy rows without mode / ambiguous: multi-factor units assumed per-input total formula */
  var facLegacy = factorForNamedUnit(product, iu);
  if (facLegacy != null && facLegacy > 1 && !isProductBaseUnitLabel(product, iu) && isFinite(iq) && iq > 0) {
    return Math.round(iq * ec * 100) / 100;
  }

  if (bq <= 0 && isFinite(iq) && iq > 0) {
    bq = Math.round(toProductBaseQty(iq, iu, product) * 1000000) / 1000000;
  }
  return Math.round(bq * ec * 100) / 100;
}

/**
 * Total money for stock received on this line (matches invoice line before tax).
 * GL / summaries without product: assumes stored cost is per base unit when lineStockValue is absent.
 */
export function deriveLineStockValue(it) {
  if (it == null) return 0;
  if (it.lineStockValue != null && it.lineStockValue !== "") {
    var stored = Number(it.lineStockValue);
    if (isFinite(stored)) return stored;
  }
  var baseQty = Number(it.qty) || 0;
  var cin = Number(it.cost) || 0;
  if (!isFinite(cin)) cin = 0;
  return Math.round(baseQty * cin * 100) / 100;
}

export function normalizePurchaseLineItem(it, product, toProductBaseQty) {
  if (!it || !product || typeof toProductBaseQty !== "function") return it;
  var iq = it.inputQty !== undefined ? Number(it.inputQty) : NaN;
  var iu = it.inputUnit || it.unit || product.unit || "Pcs";
  var baseQty = Math.max(0, Number(it.qty) || 0);
  if (baseQty <= 0 && isFinite(iq) && iq > 0) {
    baseQty = Math.round(toProductBaseQty(iq, iu, product) * 1000000) / 1000000;
  }
  baseQty = Math.max(0, baseQty);

  var lineMoney = lineEconomicValue(it, product, toProductBaseQty);
  var modeOut = it.costInputMode || defaultCostInputMode(product, iu);

  if (baseQty <= 0) {
    return Object.assign({}, it, {
      qty: baseQty,
      cost: 0,
      lineStockValue: Math.round(lineMoney * 100) / 100,
      inputQty: !isNaN(iq) && iq > 0 ? iq : it.inputQty,
      inputUnit: iu,
      costInputMode: modeOut,
    });
  }
  var unitCostBase = lineMoney / baseQty;
  return Object.assign({}, it, {
    qty: Math.round(baseQty * 1000000) / 1000000,
    cost: Math.round(unitCostBase * 10000) / 10000,
    inputQty: !isNaN(iq) && iq > 0 ? iq : it.inputQty,
    inputUnit: iu,
    lineStockValue: Math.round(lineMoney * 100) / 100,
    costInputMode: modeOut,
  });
}

export function purchaseLineStockTotal(it) {
  var q = Number(it.qty) || 0;
  var c = Number(it.cost) || 0;
  return q * c;
}

export function sumPurchaseLinesStockTotal(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce(function (a, it) {
    return a + purchaseLineStockTotal(it);
  }, 0);
}

/** Cost shown in UI for the selected purchase unit (cost field), from per-base cost */
export function costPerInputUnitFromBase(unitCostBase, inputUnit, product, toProductBaseQty) {
  if (!product || typeof toProductBaseQty !== "function") return Number(unitCostBase) || 0;
  var f = toProductBaseQty(1, inputUnit || product.unit || "Pcs", product);
  if (!isFinite(f) || f <= 0) return Number(unitCostBase) || 0;
  var ucb = Number(unitCostBase) || 0;
  return Math.round(ucb * f * 10000) / 10000;
}

/** Persist per-base amount from a figure entered per purchase unit (cost Rs per sack → Rs per kg).
 * Same math applies to selling price: Rs per sack → catalogue `product.price` as Rs per base unit. */
export function unitCostBaseFromInputCost(costPerInput, inputUnit, product, toProductBaseQty) {
  if (!product || typeof toProductBaseQty !== "function") return Number(costPerInput) || 0;
  var f = toProductBaseQty(1, inputUnit || product.unit || "Pcs", product);
  if (!isFinite(f) || f <= 0) return Number(costPerInput) || 0;
  var cpi = Number(costPerInput) || 0;
  return Math.round((cpi / f) * 10000) / 10000;
}
