/**
 * Void mistaken sale / purchase invoices — full stock & balance reversal, record kept for audit.
 */
import { getReturnsForSale, getReturnsForPurchase } from "./returnDisplay.js";
import { stampProductStock, stampUpdatedAt, stampCustomerBalance } from "./stampUpdatedAt.js";

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

/** Net COGS: gross from sale lines minus returns linked to active (non-voided) parents.
 *  Optional parentSales lets day/month buckets subtract returns even when the parent sale is on another date. */
export function computeNetCOGS(sales, salesReturns, parentSales) {
  var parentLookup = parentSales != null ? parentSales : sales;
  var activeParentIds = {};
  (parentLookup || []).forEach(function (s) {
    if (s && s.id != null && !isVoidedTxn(s)) activeParentIds[String(s.id)] = true;
  });
  var grossCOGS = (sales || []).reduce(function (a, s) {
    return a + (s.items || []).reduce(function (b, it) { return b + (it.cost || 0) * it.qty; }, 0);
  }, 0);
  var returnedCOGS = (salesReturns || []).reduce(function (a, r) {
    if (r.invoiceId == null || !activeParentIds[String(r.invoiceId)]) return a;
    return a + (r.qty || 0) * (r.cost || 0);
  }, 0);
  return Math.max(0, grossCOGS - returnedCOGS);
}

export function computeNetCOGSForRange(rSales, rSalesReturns, parentSales) {
  return computeNetCOGS(rSales, rSalesReturns, parentSales);
}

/** Returns linked to a non-voided parent sale (excludes sync orphans). */
export function activeSalesReturns(sales, salesReturns) {
  var activeParentIds = {};
  (sales || []).forEach(function (s) {
    if (s && s.id != null && !isVoidedTxn(s)) activeParentIds[String(s.id)] = true;
  });
  return (salesReturns || []).filter(function (r) {
    return r && r.invoiceId != null && activeParentIds[String(r.invoiceId)];
  });
}

/** Returns linked to a non-voided parent purchase (excludes sync orphans). */
export function activePurchaseReturns(purchases, purchaseReturns) {
  var activeParentIds = {};
  (purchases || []).forEach(function (p) {
    if (p && p.id != null && !isVoidedTxn(p)) activeParentIds[String(p.id)] = true;
  });
  return (purchaseReturns || []).filter(function (r) {
    return r && r.purchaseId != null && activeParentIds[String(r.purchaseId)];
  });
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

function restoreSaleLineStock(products, productId, qty, saleCost, atIso) {
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
    return stampProductStock(Object.assign({}, p, { stock: newS, cost: round2(newC) }), atIso, p);
  });
}

/** Undo void sale stock restoration (sync reconcile when void loses to newer return). */
export function reverseSaleVoidStockEffects(products, sale, atIso) {
  var out = products || [];
  var at = atIso || new Date().toISOString();
  var prodById = {};
  out.forEach(function (p) { prodById[p.id] = p; });
  (sale && sale.items || []).forEach(function (it) {
    var q = Number(it.qty) || 0;
    if (q <= 0) return;
    var prod = prodById[it.id];
    if (prod && isServiceProduct(prod)) return;
    out = reversePurchaseLineStock(out, { id: it.id, qty: q, cost: it.cost || 0 }, at);
    prodById[it.id] = out.find(function (p) { return p.id === it.id; });
  });
  return out;
}

/** Undo void purchase stock reversal (sync reconcile when void loses to newer return). */
export function reversePurchaseVoidStockEffects(products, purchase, atIso) {
  var out = products || [];
  var at = atIso || new Date().toISOString();
  (purchase && purchase.items || []).forEach(function (it) {
    var q = Number(it.qty) || 0;
    if (q <= 0) return;
    out = restoreSaleLineStock(out, it.id, q, it.cost || 0, at);
  });
  return out;
}

export function reverseVoidSaleSideEffects(state, voidedSale, atIso) {
  if (!voidedSale || !isVoidedTxn(voidedSale)) {
    return {
      products: state.products || [],
      customers: state.customers || [],
      cheques: state.cheques || [],
    };
  }
  var at = atIso || new Date().toISOString();
  var products = reverseSaleVoidStockEffects(state.products || [], voidedSale, at);
  var customers = (state.customers || []).slice();
  if (voidedSale.customerId) {
    var outstanding = Math.max(0, (voidedSale.total || 0) - (voidedSale.paid || 0));
    customers = customers.map(function (c) {
      if (c.id !== voidedSale.customerId) return c;
      return stampCustomerBalance(Object.assign({}, c, {
        credit: round2((c.credit || 0) + outstanding),
        totalSpent: round2((c.totalSpent || 0) + (voidedSale.total || 0)),
      }), at, c);
    });
  }
  var cheques = (state.cheques || []).map(function (ch) {
    if (!ch || String(ch.saleId) !== String(voidedSale.id)) return ch;
    if (String(ch.status || "") !== "Voided") return ch;
    var note = String(ch.voidReason || "");
    if (note.indexOf("Sale voided") < 0 && note.indexOf("voided") < 0) return ch;
    var restored = ch.priorStatus || "Pending";
    var next = Object.assign({}, ch, { status: restored });
    delete next.voidedDate;
    delete next.voidReason;
    delete next.priorStatus;
    return stampUpdatedAt(next, at);
  });
  return { products: products, customers: customers, cheques: cheques };
}

export function reverseVoidPurchaseSideEffects(state, voidedPurchase, atIso) {
  if (!voidedPurchase || !isVoidedTxn(voidedPurchase)) {
    return { products: state.products || [], cheques: state.cheques || [] };
  }
  var at = atIso || new Date().toISOString();
  var products = reversePurchaseVoidStockEffects(state.products || [], voidedPurchase, at);
  var cheques = (state.cheques || []).map(function (ch) {
    if (!ch || String(ch.purchaseId) !== String(voidedPurchase.id)) return ch;
    if (String(ch.status || "") !== "Voided") return ch;
    var restored = ch.priorStatus || "Pending";
    var next = Object.assign({}, ch, { status: restored });
    delete next.voidedDate;
    delete next.voidReason;
    delete next.priorStatus;
    return stampUpdatedAt(next, at);
  });
  return { products: products, cheques: cheques };
}

export function reverseSalesReturnStockEffects(products, salesReturns, atIso) {
  var out = products || [];
  var at = atIso || new Date().toISOString();
  (salesReturns || []).forEach(function (r) {
    var q = Number(r.qty) || 0;
    if (q <= 0 || r.productId == null) return;
    out = out.map(function (p) {
      if (String(p.id) !== String(r.productId)) return p;
      return stampProductStock(Object.assign({}, p, {
        stock: Math.max(0, (Number(p.stock) || 0) - q),
      }), at, p);
    });
  });
  return out;
}

export function reversePurchaseReturnStockEffects(products, purchaseReturns, atIso) {
  var out = products || [];
  var at = atIso || new Date().toISOString();
  (purchaseReturns || []).forEach(function (r) {
    var q = Number(r.qty) || 0;
    if (q <= 0 || r.productId == null) return;
    out = out.map(function (p) {
      if (String(p.id) !== String(r.productId)) return p;
      return stampProductStock(Object.assign({}, p, {
        stock: (Number(p.stock) || 0) + q,
      }), at, p);
    });
  });
  return out;
}

/** Undo customer credit/totalSpent when a sales return row is stripped (void wins sync race). */
export function reverseStrippedSalesReturnCustomerEffects(customers, sales, strippedReturns, atIso) {
  var out = (customers || []).slice();
  var at = atIso || new Date().toISOString();
  var byInvoice = {};
  (strippedReturns || []).forEach(function (r) {
    if (!r || r.invoiceId == null) return;
    var key = String(r.invoiceId);
    if (!byInvoice[key]) byInvoice[key] = { returns: [], customerId: r.customerId || "" };
    byInvoice[key].returns.push(r);
    if (r.customerId) byInvoice[key].customerId = r.customerId;
  });
  Object.keys(byInvoice).forEach(function (invId) {
    var grp = byInvoice[invId];
    if (!grp.customerId) return;
    var sale = (sales || []).find(function (s) { return s && String(s.id) === invId; });
    if (!sale) return;
    var returnTotal = grp.returns.reduce(function (sum, r) { return sum + (Number(r.amount) || 0); }, 0);
    if (returnTotal <= 0) return;
    var origPaid = Number(sale.paid) || 0;
    var origTotal = Number(sale.total) || 0;
    var origOutstanding = Math.max(0, origTotal - origPaid);
    var newTotal = Math.max(0, origTotal - returnTotal);
    var newOutstanding = Math.max(0, newTotal - Math.min(origPaid, newTotal));
    var debtReduced = Math.max(0, origOutstanding - newOutstanding);
    out = out.map(function (c) {
      if (c.id !== grp.customerId) return c;
      return stampCustomerBalance(Object.assign({}, c, {
        credit: round2((c.credit || 0) + debtReduced),
        totalSpent: round2((c.totalSpent || 0) + returnTotal),
      }), at, c);
    });
  });
  return out;
}

function reversePurchaseLineStock(products, line, atIso) {
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
    return stampProductStock(Object.assign({}, p, { stock: Math.max(0, preS), cost: round2(preC) }), atIso, p);
  });
}

/**
 * Paid cash/bank to refund from drawer/bank when voiding.
 * Pending cheque amounts are cancelled (not refunded as cash).
 */
export function computeVoidSaleRefundHint(sale, cheques) {
  var paid = round2(sale && sale.paid || 0);
  if (paid <= 0) {
    return { cashBankRefund: 0, pendingChequeCancel: 0, clearedChequeNote: 0, message: "" };
  }
  var pendingChq = 0;
  var clearedChq = 0;
  (cheques || []).forEach(function (ch) {
    if (!ch || ch.saleId !== sale.id) return;
    var amt = round2(ch.amount || 0);
    if (ch.status === "Pending") pendingChq += amt;
    else if (ch.status === "Cleared") clearedChq += amt;
  });
  var cashBankRefund = round2(Math.max(0, paid - pendingChq - clearedChq));
  var parts = [];
  if (cashBankRefund > 0) {
    parts.push("Refund " + cashBankRefund + " cash/bank to the customer (drawer or bank remittance).");
  }
  if (pendingChq > 0) {
    parts.push("Pending cheques for this invoice are cancelled.");
  }
  if (clearedChq > 0) {
    parts.push("Cleared cheques (" + clearedChq + ") are marked void — reverse the bank deposit manually if needed.");
  }
  return {
    cashBankRefund: cashBankRefund,
    pendingChequeCancel: pendingChq,
    clearedChequeNote: clearedChq,
    message: parts.join(" "),
  };
}

export function buildVoidSaleUpdates(state, saleId, reason, nowIso) {
  var sale = (state.sales || []).find(function (s) { return s.id === saleId; });
  var block = voidSaleBlockReason(sale, state);
  if (block) return { ok: false, error: block };
  if (!String(reason || "").trim()) return { ok: false, error: "Please select a void reason." };

  var at = nowIso || new Date().toISOString();
  var products = (state.products || []).slice();
  var prodById = {};
  products.forEach(function (p) { prodById[p.id] = p; });

  (sale.items || []).forEach(function (it) {
    var q = Number(it.qty) || 0;
    if (q <= 0) return;
    var prod = prodById[it.id];
    if (prod && isServiceProduct(prod)) return;
    products = restoreSaleLineStock(products, it.id, q, it.cost || 0, at);
    prodById[it.id] = products.find(function (p) { return p.id === it.id; });
  });

  var customers = (state.customers || []).slice();
  if (sale.customerId) {
    var outstanding = Math.max(0, (sale.total || 0) - (sale.paid || 0));
    customers = customers.map(function (c) {
      if (c.id !== sale.customerId) return c;
      return stampCustomerBalance(Object.assign({}, c, {
        credit: Math.max(0, round2((c.credit || 0) - outstanding)),
        totalSpent: Math.max(0, round2((c.totalSpent || 0) - (sale.total || 0))),
      }), at, c);
    });
  }

  var refundHint = computeVoidSaleRefundHint(sale, state.cheques || []);

  var cheques = (state.cheques || []).map(function (ch) {
    if (!ch || ch.saleId !== sale.id) return ch;
    if (ch.status === "Voided") return ch;
    return stampUpdatedAt(Object.assign({}, ch, {
      status: "Voided",
      voidedDate: at.slice(0, 10),
      voidReason: ch.status === "Cleared"
        ? "Sale voided (was Cleared — reverse bank if needed)"
        : "Sale voided",
      priorStatus: ch.status || "",
    }), at);
  });

  var voidedSale = stampUpdatedAt(Object.assign({}, sale, {
    status: "Voided",
    voidedAt: at,
    voidReason: String(reason || "").trim(),
    voidRefundCashBank: refundHint.cashBankRefund,
    voidRefundNote: refundHint.message || undefined,
  }), at);

  var sales = (state.sales || []).map(function (s) {
    return s.id === saleId ? voidedSale : s;
  });

  var codRecords = Array.isArray(state.codRecords) ? state.codRecords : null;
  var nextCod = null;
  if (codRecords) {
    nextCod = codRecords.filter(function (r) { return !(r && String(r.saleId) === String(saleId)); });
  }

  var out = {
    ok: true,
    products: products,
    customers: customers,
    sales: sales,
    cheques: cheques,
    voidedSale: voidedSale,
    refundHint: refundHint,
  };
  if (nextCod) out.codRecords = nextCod;
  return out;
}

export function buildVoidPurchaseUpdates(state, purchaseId, reason, nowIso) {
  var purchase = (state.purchases || []).find(function (p) { return p.id === purchaseId; });
  var block = voidPurchaseBlockReason(purchase, state);
  if (block) return { ok: false, error: block };
  if (!String(reason || "").trim()) return { ok: false, error: "Please select a void reason." };

  var at = nowIso || new Date().toISOString();
  var products = (state.products || []).slice();
  (purchase.items || []).forEach(function (it) {
    products = reversePurchaseLineStock(products, it, at);
  });

  var cheques = (state.cheques || []).map(function (ch) {
    if (!ch || ch.purchaseId !== purchase.id) return ch;
    if (ch.status === "Voided") return ch;
    return stampUpdatedAt(Object.assign({}, ch, {
      status: "Voided",
      voidedDate: at.slice(0, 10),
      voidReason: ch.status === "Cleared"
        ? "Purchase voided (was Cleared — reverse bank if needed)"
        : "Purchase voided",
      priorStatus: ch.status || "",
    }), at);
  });

  var voidedPurchase = stampUpdatedAt(Object.assign({}, purchase, {
    status: "Voided",
    voidedAt: at,
    voidReason: String(reason || "").trim(),
  }), at);

  var purchases = (state.purchases || []).map(function (p) {
    return p.id === purchaseId ? voidedPurchase : p;
  });

  return { ok: true, products: products, purchases: purchases, cheques: cheques, voidedPurchase: voidedPurchase };
}
