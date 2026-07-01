/**
 * POS complimentary (free gift) line helpers — separate from paid cart lines.
 */
import { glassInvoiceLineTotal, glassInvoiceRateLabel } from "./glassProduct.js";

export var FREE_ITEM_LABEL = "FREE";

export function isFreeSaleLine(it) {
  return !!(it && it.isFree === true);
}

export function splitSaleItemsByFree(items) {
  var paid = [];
  var free = [];
  (items || []).forEach(function (it) {
    if (isFreeSaleLine(it)) free.push(it);
    else paid.push(it);
  });
  return { paid: paid, free: free };
}

export function baseQtyInCartLines(product, lines, toProductBaseQty) {
  return (lines || []).filter(function (x) { return x.id === product.id; }).reduce(function (a, x) {
    return a + toProductBaseQty(x.qty || 0, x.saleUnit || x.unit || "Pcs", product);
  }, 0);
}

export function formatInvoiceLinePrice(it, fmtNum, getCurrencySymbol) {
  if (isFreeSaleLine(it)) return FREE_ITEM_LABEL;
  if (it && it.isGlassLine) return glassInvoiceRateLabel(it, getCurrencySymbol, fmtNum);
  return (getCurrencySymbol ? getCurrencySymbol() + " " : "") + fmtNum(it.price || 0);
}

export function formatInvoiceLineTotal(it, fmtNum, getCurrencySymbol) {
  if (isFreeSaleLine(it)) return FREE_ITEM_LABEL;
  var sym = getCurrencySymbol ? getCurrencySymbol() : "";
  if (it && it.isGlassLine) return sym + " " + fmtNum(glassInvoiceLineTotal(it));
  return sym + " " + fmtNum((it.qty || 0) * (it.price || 0));
}
