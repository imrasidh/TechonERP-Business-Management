/**
 * One-time backfill: set raw_material product price/cost from latest purchase line
 * (per-base cost from normalized line; per-base sell from sell per input unit / unit factor).
 */
import { normalizePurchaseLineItem, unitCostBaseFromInputCost } from "./purchaseValuation.js";
import { toProductBaseQty } from "./toProductBaseQty.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function isRawMaterial(p) {
  return String((p && p.type) || "").toLowerCase() === "raw_material";
}

/** Latest purchase containing this product id (by date desc, then purchase id desc). */
export function findLatestPurchaseLineForProduct(purchases, productId) {
  var sorted = (purchases || []).slice().sort(function (a, b) {
    var da = String(a.date || "");
    var db = String(b.date || "");
    if (da !== db) return db.localeCompare(da);
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
  for (var i = 0; i < sorted.length; i++) {
    var pur = sorted[i];
    var items = pur.items || [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (it && it.id === productId) {
        return { purchase: pur, item: it };
      }
    }
  }
  return null;
}

function syncBaseRowOnProduct(product, newPrice, newCost) {
  var o = Object.assign({}, product, {
    price: round2(newPrice),
    cost: round2(newCost),
  });
  if (Array.isArray(o.units) && o.units.length > 0) {
    o.units = o.units.map(function (r, idx) {
      if (idx === 0 && Number(r.factor) <= 1) {
        return Object.assign({}, r, {
          sellPrice: round2(newPrice),
          cost: round2(newCost),
        });
      }
      return r;
    });
  }
  return o;
}

/**
 * @returns {{ changes: Array<{ id: string, name: string, oldPrice: number, newPrice: number, oldCost: number, newCost: number, purchaseId: string, purchaseDate: string, purchaseInvoiceNo: string }>, skipped: Array<{ id: string, reason: string }> }}
 */
export function computeRawMaterialPricingBackfillPlan(products, purchases) {
  var changes = [];
  var skipped = [];
  for (var i = 0; i < (products || []).length; i++) {
    var p = products[i];
    if (!p || !isRawMaterial(p)) continue;
    var hit = findLatestPurchaseLineForProduct(purchases, p.id);
    if (!hit) {
      skipped.push({ id: p.id, reason: "no_purchase_line" });
      continue;
    }
    var it = hit.item;
    var normIt = normalizePurchaseLineItem(it, p, toProductBaseQty);
    var iu = normIt.inputUnit || normIt.unit || p.unit || "Pcs";
    var sellIn = Number(it.sellPrice);
    var newPrice =
      isFinite(sellIn) && sellIn > 0
        ? unitCostBaseFromInputCost(sellIn, iu, p, toProductBaseQty)
        : parseFloat(p.price) || 0;
    var newCost = isFinite(Number(normIt.cost)) ? Number(normIt.cost) : 0;

    var oldPrice = parseFloat(p.price) || 0;
    var oldCost = parseFloat(p.cost) || 0;

    if (Math.abs(newPrice - oldPrice) < 0.005 && Math.abs(newCost - oldCost) < 0.005) {
      skipped.push({ id: p.id, reason: "unchanged" });
      continue;
    }

    changes.push({
      id: p.id,
      name: p.name || "",
      oldPrice: oldPrice,
      newPrice: round2(newPrice),
      oldCost: oldCost,
      newCost: round2(newCost),
      purchaseId: hit.purchase.id || "",
      purchaseDate: String(hit.purchase.date || ""),
      purchaseInvoiceNo: String(hit.purchase.invoiceNo || ""),
    });
  }
  return { changes: changes, skipped: skipped };
}

export function applyRawMaterialPricingPlanToProducts(products, plan) {
  var byId = {};
  for (var i = 0; i < plan.changes.length; i++) {
    byId[plan.changes[i].id] = plan.changes[i];
  }
  return (products || []).map(function (p) {
    var ch = byId[p.id];
    if (!ch) return p;
    return syncBaseRowOnProduct(p, ch.newPrice, ch.newCost);
  });
}
