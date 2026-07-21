/**
 * After void/return sync reconcile — realign stock to inventory replay and fix customer/cheque drift.
 */
import { deriveInventoryEconomics } from "../accounting/inventoryEngine.js";
import { round2 } from "../accounting/generalLedger.js";
import { stampProductStock } from "./stampUpdatedAt.js";
import {
  reverseVoidSaleSideEffects,
  reverseVoidPurchaseSideEffects,
  reverseSalesReturnStockEffects,
  reversePurchaseReturnStockEffects,
  reverseStrippedSalesReturnCustomerEffects,
} from "./voidInvoice.js";

function sumLayerQty(layers) {
  return (layers || []).reduce(function (s, L) {
    return s + (Number(L.remainingQty != null ? L.remainingQty : L.qty) || 0);
  }, 0);
}

function layerWacCost(layers) {
  var qty = 0;
  var val = 0;
  (layers || []).forEach(function (L) {
    var q = Number(L.remainingQty != null ? L.remainingQty : L.qty) || 0;
    var c = Number(L.unitCost != null ? L.unitCost : L.cost) || 0;
    qty += q;
    val += q * c;
  });
  return qty > 0 ? round2(val / qty) : 0;
}

/** Set tc3_products stock/cost from full inventory replay (canonical txn source). */
export function realignProductStockFromReplay(state, S) {
  var mockS = S && typeof S.get === "function" ? S : { get: function () { return null; } };
  var invDer = deriveInventoryEconomics(state, mockS);
  var layers = invDer.layersByProduct || {};
  var at = new Date().toISOString();
  var products = (state.products || []).map(function (p) {
    if (!p || p.id == null) return p;
    if (String(p.type || "").toLowerCase() === "service") return p;
    if (p.status === "inactive") return p;
    var pid = String(p.id);
    if (!layers[pid]) return p;
    var stock = sumLayerQty(layers[pid]);
    var cost = layerWacCost(layers[pid]);
    return stampProductStock(Object.assign({}, p, {
      stock: stock,
      cost: cost > 0 ? cost : (p.cost || 0),
    }), at, p);
  });
  return { products: products };
}

/**
 * Apply compensating side effects after void/return document reconcile.
 * meta: { unvoidedSales, unvoidedPurchases, strippedSalesReturns, strippedPurchaseReturns }
 */
export function applyVoidReturnReconcileSideEffects(merged, meta, S) {
  if (!merged || typeof merged !== "object") return merged;
  meta = meta || {};
  var at = new Date().toISOString();
  var state = {
    products: merged.tc3_products || [],
    customers: merged.tc3_customers || [],
    cheques: merged.tc3_cheques || [],
    sales: merged.tc3_sales || [],
    purchases: merged.tc3_purchases || [],
    salesReturns: merged.tc3_salesReturns || [],
    purchaseReturns: merged.tc3_purchaseReturns || [],
    settings: merged.tc3_settings || {},
    openBal: merged.tc3_openBal || null,
    manualPayables: merged.tc3_manualPayables || [],
    expenses: merged.tc3_expenses || [],
    repairs: merged.tc3_repairs || [],
    damageLog: merged.tc3_damageLog || [],
  };

  (meta.unvoidedSales || []).forEach(function (voidedSale) {
    var fx = reverseVoidSaleSideEffects(state, voidedSale, at);
    state.products = fx.products;
    state.customers = fx.customers;
    state.cheques = fx.cheques;
  });

  (meta.unvoidedPurchases || []).forEach(function (voidedPur) {
    var fxP = reverseVoidPurchaseSideEffects(state, voidedPur, at);
    state.products = fxP.products;
    state.cheques = fxP.cheques;
  });

  if ((meta.strippedSalesReturns || []).length) {
    state.products = reverseSalesReturnStockEffects(state.products, meta.strippedSalesReturns, at);
    state.customers = reverseStrippedSalesReturnCustomerEffects(
      state.customers,
      state.sales,
      meta.strippedSalesReturns,
      at
    );
  }
  if ((meta.strippedPurchaseReturns || []).length) {
    state.products = reversePurchaseReturnStockEffects(state.products, meta.strippedPurchaseReturns, at);
  }

  var realigned = realignProductStockFromReplay(Object.assign({}, state, {
    products: state.products,
  }), S);
  state.products = realigned.products;

  var out = Object.assign({}, merged);
  out.tc3_products = state.products;
  out.tc3_customers = state.customers;
  out.tc3_cheques = state.cheques;
  return out;
}
