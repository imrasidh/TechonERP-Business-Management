/**
 * Void mistaken sale / purchase invoices — full stock & balance reversal, record kept for audit.
 */
import { getReturnsForSale, getReturnsForPurchase } from "./returnDisplay.js";

export var VOID_REASON_OPTIONS = [
  "Wrong customer / supplier",
  "Wrong items or quantities",
  "Duplicate entry",
  "Price mistake",
  "Test / training entry",
  "Other",
];

function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

export function isVoidedTxn(txn) {
  if (!txn) return false;
  var st = String(txn.status || "");
  return st === "Voided" || st === "Cancelled";
}

export function activeSales(sales) {
  return (sales || []).filter(function (s) { return !isVoidedTxn(s); });
}

export function activePurchases(purchases) {
  return (purchases || []).filter(function (p) { return !isVoidedTxn(p); });
}

function isServiceProduct(p) {
  return String((p && p.type) || "stock").toLowerCase() === "service";
}

export function voidSaleBlockReason(sale, state) {
  if (!sale) return "Invoice not found.";
  if (isVoidedTxn(sale)) return "This invoice is already voided.";
  if (getReturnsForSale(sale, state.salesReturns).length) {
    return "This invoice has return records. Use Sales Return instead of void.";
  }
  return null;
}

export function voidPurchaseBlockReason(purchase, state) {
  if (!purchase) return "Purchase not found.";
  if (isVoidedTxn(purchase)) return "This purchase is already voided.";
  if (getReturnsForPurchase(purchase, state.purchaseReturns).length) {
    return "This purchase has return records. Use Purchase Return instead of void.";
  }
  var products = state.products || [];
  var block = null;
  (purchase.items || []).forEach(function (it) {
    if (block) return;
    var q = Number(it.qty) || 0;
    if (q <= 0) return;
    var prod = products.find(function (p) { return p.id === it.id; });
    var curS = prod ? (Number(prod.stock) || 0) : 0;
    if (curS - q < -1e-9) {
      block = "Cannot void: some units from \"" + (it.name || "item") + "\" were already sold.";
    }
  });
  return block;
}

function restoreSaleLineStock(products, productId, qty, saleCost) {
  return products.map(function (p) {
    if (p.id !== productId) return p;
    var curS = p.stock || 0;
    var curC = p.cost || 0;
    var q = Number(qty) || 0;
    var retCost = Number(saleCost) || 0;
    var newS = curS + q;
    var newC;
    if (newS <= 0) {
      newC = curC;
    } else if (curS <= 0) {
      newC = retCost;
    } else {
      newC = ((curS * curC) + (q * retCost)) / newS;
    }
    return Object.assign({}, p, { stock: newS, cost: round2(newC) });
  });
}

function reversePurchaseLineStock(products, line) {
  return products.map(function (p) {
    if (p.id !== line.id) return p;
    var curS = p.stock || 0;
    var curC = p.cost || 0;
    var oldQty = Number(line.qty) || 0;
    var oidCost = Number(line.cost) || 0;
    var preS = curS - oldQty;
    var preC;
    if (preS <= 0) {
      preC = curC;
    } else {
      var totalVal = curS * curC;
      var oldVal = oidCost * oldQty;
      preC = (totalVal - oldVal) / preS;
      if (preC < 0) preC = curC;
    }
    return Object.assign({}, p, { stock: Math.max(0, preS), cost: round2(preC) });
  });
}

export function buildVoidSaleUpdates(state, saleId, reason, nowIso) {
  var sale = (state.sales || []).find(function (s) { return s.id === saleId; });
  var block = voidSaleBlockReason(sale, state);
  if (block) return { ok: false, error: block };
  if (!String(reason || "").trim()) return { ok: false, error: "Please select a void reason." };

  var products = (state.products || []).slice();
  var prodById = {};
  products.forEach(function (p) { prodById[p.id] = p; });

  (sale.items || []).forEach(function (it) {
    var q = Number(it.qty) || 0;
    if (q <= 0) return;
    var prod = prodById[it.id];
    if (prod && isServiceProduct(prod)) return;
    products = restoreSaleLineStock(products, it.id, q, it.cost || 0);
    prodById[it.id] = products.find(function (p) { return p.id === it.id; });
  });

  var customers = (state.customers || []).slice();
  if (sale.customerId) {
    var outstanding = Math.max(0, (sale.total || 0) - (sale.paid || 0));
    customers = customers.map(function (c) {
      if (c.id !== sale.customerId) return c;
      return Object.assign({}, c, {
        credit: Math.max(0, round2((c.credit || 0) - outstanding)),
        totalSpent: Math.max(0, round2((c.totalSpent || 0) - (sale.total || 0))),
      });
    });
  }

  var cheques = (state.cheques || []).map(function (ch) {
    if (ch.saleId === sale.id && ch.status === "Pending") {
      return Object.assign({}, ch, {
        status: "Voided",
        voidedDate: (nowIso || new Date().toISOString()).slice(0, 10),
        voidReason: "Sale voided",
      });
    }
    return ch;
  });

  var voidedSale = Object.assign({}, sale, {
    status: "Voided",
    voidedAt: nowIso || new Date().toISOString(),
    voidReason: String(reason || "").trim(),
  });

  var sales = (state.sales || []).map(function (s) {
    return s.id === saleId ? voidedSale : s;
  });

  return { ok: true, products: products, customers: customers, sales: sales, cheques: cheques, voidedSale: voidedSale };
}

export function buildVoidPurchaseUpdates(state, purchaseId, reason, nowIso) {
  var purchase = (state.purchases || []).find(function (p) { return p.id === purchaseId; });
  var block = voidPurchaseBlockReason(purchase, state);
  if (block) return { ok: false, error: block };
  if (!String(reason || "").trim()) return { ok: false, error: "Please select a void reason." };

  var products = (state.products || []).slice();
  (purchase.items || []).forEach(function (it) {
    products = reversePurchaseLineStock(products, it);
  });

  var cheques = (state.cheques || []).map(function (ch) {
    if (ch.purchaseId === purchase.id && ch.status === "Pending") {
      return Object.assign({}, ch, {
        status: "Voided",
        voidedDate: (nowIso || new Date().toISOString()).slice(0, 10),
        voidReason: "Purchase voided",
      });
    }
    return ch;
  });

  var voidedPurchase = Object.assign({}, purchase, {
    status: "Voided",
    voidedAt: nowIso || new Date().toISOString(),
    voidReason: String(reason || "").trim(),
  });

  var purchases = (state.purchases || []).map(function (p) {
    return p.id === purchaseId ? voidedPurchase : p;
  });

  return { ok: true, products: products, purchases: purchases, cheques: cheques, voidedPurchase: voidedPurchase };
}
