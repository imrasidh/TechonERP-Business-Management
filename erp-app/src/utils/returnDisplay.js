/**
 * Read-only helpers for linking display to tc3_salesReturns / tc3_purchaseReturns.
 * Does not change business logic — uses existing invoiceId / purchaseId on return rows.
 */

export function getReturnsForSale(sale, salesReturns) {
  if (!sale) return [];
  var sid = sale.id;
  var invNo = sale.invoiceNo;
  return (salesReturns || []).filter(function (r) {
    return r.invoiceId === sid || (invNo && r.invoiceNo === invNo);
  });
}

export function getReturnsForPurchase(purchase, purchaseReturns) {
  if (!purchase) return [];
  var pid = purchase.id;
  return (purchaseReturns || []).filter(function (r) {
    return r.purchaseId === pid;
  });
}

export function saleReturnUiStatus(sale, salesReturns) {
  var rows = getReturnsForSale(sale, salesReturns);
  var totalRet = rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
  var totalQty = rows.reduce(function (a, r) { return a + (Number(r.qty) || 0); }, 0);
  if (totalRet <= 0 && totalQty <= 0) {
    return { hasReturns: false, label: null, kind: "none", rows: [], totalRet: 0, totalQty: 0 };
  }
  var rem = Number(sale.total) || 0;
  if (rem <= 0.009) {
    return { hasReturns: true, label: "Returned", kind: "full", rows: rows, totalRet: totalRet, totalQty: totalQty };
  }
  return { hasReturns: true, label: "Partially Returned", kind: "partial", rows: rows, totalRet: totalRet, totalQty: totalQty };
}

export function purchaseReturnUiStatus(purchase, purchaseReturns) {
  var rows = getReturnsForPurchase(purchase, purchaseReturns);
  var totalRet = rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
  var totalQty = rows.reduce(function (a, r) { return a + (Number(r.qty) || 0); }, 0);
  if (totalRet <= 0 && totalQty <= 0) {
    return { hasReturns: false, label: null, kind: "none", rows: [], totalRet: 0, totalQty: 0 };
  }
  var rem = Number(purchase.total) || 0;
  if (rem <= 0.009) {
    return { hasReturns: true, label: "Returned", kind: "full", rows: rows, totalRet: totalRet, totalQty: totalQty };
  }
  return { hasReturns: true, label: "Partially Returned", kind: "partial", rows: rows, totalRet: totalRet, totalQty: totalQty };
}

export function displayStatusForSale(sale, salesReturns) {
  var u = saleReturnUiStatus(sale, salesReturns);
  if (u.hasReturns) return u.label;
  return sale.payStatus || "Unpaid";
}

export function displayStatusForPurchase(purchase, purchaseReturns) {
  var u = purchaseReturnUiStatus(purchase, purchaseReturns);
  if (u.hasReturns) return u.label;
  return purchase.status || "Unpaid";
}
