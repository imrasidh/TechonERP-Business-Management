/**
 * Same behaviour as App.jsx toProductBaseQty — used by backfill and pricing utilities
 * without importing the full App module.
 */
import { factorForNamedUnit, isProductsUnitsArray } from "../units/productUnits.js";

var UNIT_GROUPS = {
  weight: { base: "Kg", units: ["G", "Kg"], factors: { G: 0.001, Kg: 1 } },
  volume: { base: "Litre", units: ["ML", "Litre"], factors: { ML: 0.001, Litre: 1 } },
  length: { base: "Metre", units: ["MM", "CM", "Metre"], factors: { MM: 0.001, CM: 0.01, Metre: 1 } },
  count: {
    base: "Pcs",
    units: [
      "Pcs", "Dozen", "Pack", "Box", "Sack", "Bundle", "Carton", "Tray", "Set", "Pair", "Roll", "Tin", "Bottle", "Strip", "Sachet", "Kit", "Bag", "Gram", "Sovereign", "Carat", "Tola", "Ounce", "Acre", "Vial", "Ampule", "Tube", "Capsule", "Tablet", "Sheet", "Hour", "Job",
    ],
    factors: { Dozen: 12 },
  },
};

function getUnitGroup(unit) {
  var u = unit || "Pcs";
  var keys = Object.keys(UNIT_GROUPS);
  for (var i = 0; i < keys.length; i++) {
    if (UNIT_GROUPS[keys[i]].units.indexOf(u) >= 0) return UNIT_GROUPS[keys[i]];
  }
  return UNIT_GROUPS.count;
}

function toBaseQty(saleQty, saleUnit, baseUnit) {
  if (saleUnit === baseUnit) return saleQty;
  var group = getUnitGroup(baseUnit);
  var fromFactor = group.factors[saleUnit] !== undefined ? group.factors[saleUnit] : 1;
  var toFactor = group.factors[baseUnit] !== undefined ? group.factors[baseUnit] : 1;
  return Math.round(saleQty * (fromFactor / toFactor) * 1000000) / 1000000;
}

function isPackageBulkUnit(a, b) {
  if (!a || !b) return false;
  var pkg = /^(box|carton|tray|sack|bundle|pack|case|dozen|bag|crate)$/i;
  return pkg.test(a) && !pkg.test(b);
}

export function toProductBaseQty(qty, inputUnit, product) {
  var q = parseFloat(qty) || 0;
  if (!product) return q;
  var baseU = product.unit || "Pcs";
  if (isProductsUnitsArray(product)) {
    var f = factorForNamedUnit(product, inputUnit || baseU);
    if (f != null && f > 0) return Math.round(q * f * 1000000) / 1000000;
    return toBaseQty(q, inputUnit || baseU, baseU);
  }
  var bulkU = product.bulkUnit || "";
  var conv = parseFloat(product.bulkConversion) || 0;
  if (!product.bulkEnabled || !bulkU || conv <= 0) {
    return toBaseQty(q, inputUnit || baseU, baseU);
  }
  if (inputUnit === baseU) return q;
  if (inputUnit === bulkU) {
    if (isPackageBulkUnit(bulkU, baseU)) {
      return Math.round(q * conv * 1000000) / 1000000;
    }
    if (isPackageBulkUnit(baseU, bulkU)) {
      return Math.round((q / conv) * 1000000) / 1000000;
    }
    return Math.round(q * conv * 1000000) / 1000000;
  }
  return toBaseQty(q, inputUnit || baseU, baseU);
}
