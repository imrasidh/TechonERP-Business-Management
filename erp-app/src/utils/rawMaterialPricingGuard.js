/**
 * Guards for raw_material products: catalogue cost/price must be per base unit (per Kg, etc.).
 */

export var RAW_MATERIAL_PRICE_COST_HINT =
  "Cost and Price must be per base unit (e.g., per Kg), not per sack total.";

var WEIGHT_VOL_BASE = new Set(["kg", "g", "litre", "ml"]);

/** True for typical base units where pack-total confusion happens */
export function isRawMaterialGuardBaseUnit(unitName) {
  var u = String(unitName || "")
    .trim()
    .toLowerCase();
  if (!u) return false;
  if (WEIGHT_VOL_BASE.has(u)) return true;
  if (u === "liter" || u === "litre" || u === "l") return true;
  if (u === "pcs" || u === "pc" || u === "piece" || u === "pieces") return true;
  return false;
}

function num(x) {
  var n = Number(x);
  return isFinite(n) ? n : 0;
}

/**
 * Heuristic: entered catalogue cost/price may be a pack/sack total instead of per-base-unit.
 */
export function rawMaterialEnteredLooksLikePackTotal(cost, price, unitName) {
  if (!isRawMaterialGuardBaseUnit(unitName)) return false;
  var c = num(cost);
  var p = num(price);
  var u = String(unitName || "")
    .trim()
    .toLowerCase();

  if (u === "kg" || u === "l" || u === "liter" || u === "litre" || u === "l") {
    if (c >= 350) return true;
    if (p >= 8000) return true;
    if (c > 50 && p > 50 && p >= c * 80) return true;
    return false;
  }
  if (u === "g" || u === "ml") {
    if (c >= 120) return true;
    if (p >= 2500) return true;
    return false;
  }
  /* pcs */
  if (c >= 2500) return true;
  if (p >= 35000) return true;
  return false;
}

export function rawMaterialPackPricingConfirmMessage(cost, price, unitName) {
  return (
    "Cost or sell price looks like a full pack or sack total, not per " +
    (unitName || "base unit") +
    ".\n\n" +
    "Cost: " +
    cost +
    " — Price: " +
    price +
    "\n\n" +
    "Continue saving anyway?"
  );
}
