/**
 * Purchase line: require product extra-units when input unit is not base; warn on base unit if $ look like pack total.
 */
import { isProductBaseUnitLabel, factorForNamedUnit } from "../units/productUnits.js";
import { unitCostBaseFromInputCost } from "./purchaseValuation.js";

/**
 * Catalogue `product.price` is per base unit; purchase line `sellPrice` is per selected purchase unit.
 * When base unit is selected but sell looks like a pack total for multiple base units, divide by input qty.
 */
export function catalogSellPricePerBaseFromLine(it, product, toProductBaseQty, getUnitCostPrice, getUnitSellPrice) {
  if (!it || !product || typeof toProductBaseQty !== "function") return null;
  var sp = parseFloat(it.sellPrice);
  if (!isFinite(sp) || sp <= 0) return null;
  var iu = it.inputUnit || it.unit || product.unit || "Pcs";
  var factor = toProductBaseQty(1, iu, product);
  if (!isFinite(factor) || factor <= 0) factor = 1;
  /* Treat near-integer factors as exact for base-vs-alt distinction */
  var fr = Math.round(factor * 1000000) / 1000000;
  if (Math.abs(fr - 1) < 1e-9) fr = 1;

  if (fr === 1) {
    var iq = Number(it.inputQty);
    if (!isFinite(iq) || iq <= 0) iq = Number(it.qty) || 1;
    var shouldDivideByQty = false;
    if (
      iq > 1 &&
      typeof getUnitCostPrice === "function" &&
      typeof getUnitSellPrice === "function" &&
      purchaseLineBaseUnitLooksLikePackTotal(product, it, getUnitCostPrice, getUnitSellPrice)
    ) {
      shouldDivideByQty = true;
    }
    /* Deterministic fallback (stock + raw_material): entered sell may be full-line total for iq base units;
       catches corrupted catalogue sell so catalogue-relative checks above may not fire. */
    if (!shouldDivideByQty && iq > 1) {
      var baseCost2 = Number(it.cost) || 0;
      var perBaseCand = sp / iq;
      if (baseCost2 > 0) {
        var suspiciousHuge2 = sp >= baseCost2 * 8;
        var candidateReasonable2 = perBaseCand >= baseCost2 * 0.5 && perBaseCand <= baseCost2 * 4;
        if (suspiciousHuge2 && candidateReasonable2) shouldDivideByQty = true;
      } else {
        if (sp >= 8000 && perBaseCand <= 2500) shouldDivideByQty = true;
      }
    }
    if (shouldDivideByQty) {
      return Math.round((sp / iq) * 10000) / 10000;
    }
    return sp;
  }
  return unitCostBaseFromInputCost(sp, iu, product, toProductBaseQty);
}

export function purchaseUnitConversionMissingMessage(inputUnit) {
  var u = String(inputUnit || "").trim() || "this unit";
  return "Unit conversion missing for " + u + ". Add this unit in product extra units (e.g., Sack factor 25).";
}

export function isPurchaseInputUnitMissingFactor(product, inputUnit) {
  if (!product) return false;
  if (isProductBaseUnitLabel(product, inputUnit)) return false;
  var f = factorForNamedUnit(product, inputUnit);
  return f == null || f <= 0;
}

/** Use product base unit when preferred unit is stale (e.g. default Pcs on Sq Ft product). */
export function resolvePurchaseInputUnit(product, preferredUnit) {
  if (!product) return String(preferredUnit || "").trim() || "Pcs";
  var bu = String(product.unit || "Pcs").trim();
  var u = String(preferredUnit || "").trim();
  if (!u) return bu;
  if (isProductBaseUnitLabel(product, u)) return bu;
  var f = factorForNamedUnit(product, u);
  if (f != null && f > 0) return u;
  return bu;
}

/**
 * When the line uses the base unit, flag if cost/sell are extremely high vs catalogue (likely pack/sack total per base by mistake).
 */
export function purchaseLineBaseUnitLooksLikePackTotal(product, lineItem, getUnitCostPrice, getUnitSellPrice) {
  if (!product || !lineItem) return false;
  if (typeof getUnitCostPrice !== "function" || typeof getUnitSellPrice !== "function") return false;
  var iu = lineItem.inputUnit || lineItem.unit || product.unit || "Pcs";
  if (!isProductBaseUnitLabel(product, iu)) return false;

  var baseU = product.unit || "Pcs";
  var catCost = Number(getUnitCostPrice(product, baseU)) || 0;
  var catSell = Number(getUnitSellPrice(product, baseU)) || 0;
  var lineCostBase = Number(lineItem.cost) || 0;
  var lineSell = Number(lineItem.sellPrice) || 0;

  var costHigh = false;
  if (catCost > 0.01) {
    if (lineCostBase > Math.max(catCost * 20, catCost + 300)) costHigh = true;
  } else if (lineCostBase >= 400) {
    costHigh = true;
  }

  var sellHigh = false;
  if (catSell > 0.01) {
    if (lineSell > Math.max(catSell * 20, catSell + 300)) sellHigh = true;
  } else if (lineSell >= 8000) {
    sellHigh = true;
  }

  return costHigh || sellHigh;
}

export function purchasePackTotalVsCatalogueMessage() {
  return (
    "Cost or sell looks like a full pack/sack total, but the selected unit is the product base unit (e.g. per Kg).\n\nContinue with this purchase?"
  );
}

