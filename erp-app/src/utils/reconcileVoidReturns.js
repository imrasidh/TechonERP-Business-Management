/**
 * Post-merge reconciliation: voided parents must not keep return rows (sync race safety).
 * When returns exist for a doc id, a voided merge winner is replaced by the active version.
 */
import { isVoidedTxn } from "./voidInvoice.js";
import { applyVoidReturnReconcileSideEffects } from "./voidReturnSideEffects.js";

function recordSortTs(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.updatedAt || row.createdAt || row.billedAt || row.date || "");
}

function eventSortTs(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.isoDateTime || row.updatedAt || row.createdAt || row.billedAt || row.date || "");
}

function voidEventTs(doc) {
  if (!doc || typeof doc !== "object") return "";
  return String(doc.voidedAt || doc.updatedAt || doc.createdAt || doc.date || "");
}

function latestReturnTs(returns, parentField, parentId) {
  var latest = "";
  (returns || []).forEach(function (r) {
    if (!r || String(r[parentField]) !== String(parentId)) return;
    var ts = eventSortTs(r);
    if (ts >= latest) latest = ts;
  });
  return latest;
}

function restoreActiveSaleFromVoid(sale) {
  if (!sale || !isVoidedTxn(sale)) return sale;
  var paid = Number(sale.paid) || 0;
  var total = Number(sale.total) || 0;
  var bal = Math.round((total - paid) * 100) / 100;
  var payStatus = bal <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
  var out = Object.assign({}, sale, {
    balance: bal,
    payStatus: payStatus,
    status: payStatus,
  });
  delete out.voidedAt;
  delete out.voidReason;
  delete out.voidRefundCashBank;
  delete out.voidRefundNote;
  return out;
}

function restoreActivePurchaseFromVoid(purchase) {
  if (!purchase || !isVoidedTxn(purchase)) return purchase;
  var paid = Number(purchase.paidAmount) || 0;
  var total = Number(purchase.total) || 0;
  var bal = Math.round((total - paid) * 100) / 100;
  var status = bal <= 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
  var out = Object.assign({}, purchase, {
    balance: bal,
    status: status,
  });
  delete out.voidedAt;
  delete out.voidReason;
  return out;
}

/** When void + return coexist with no active version, LWW: newer return → restore parent; newer void → strip return later. */
export function resolveVoidReturnConflictsByTimestamp(sales, salesReturns, purchases, purchaseReturns) {
  var nextSales = (sales || []).slice();
  var nextPurchases = (purchases || []).slice();
  var unvoidedSales = [];
  var unvoidedPurchases = [];

  nextSales = nextSales.map(function (s) {
    if (!s || s.id == null || !isVoidedTxn(s)) return s;
    var retTs = latestReturnTs(salesReturns, "invoiceId", s.id);
    if (!retTs) return s;
    var vTs = voidEventTs(s);
    if (vTs && retTs <= vTs) return s;
    unvoidedSales.push(s);
    return restoreActiveSaleFromVoid(s);
  });

  nextPurchases = nextPurchases.map(function (p) {
    if (!p || p.id == null || !isVoidedTxn(p)) return p;
    var retTs = latestReturnTs(purchaseReturns, "purchaseId", p.id);
    if (!retTs) return p;
    var vTs = voidEventTs(p);
    if (vTs && retTs <= vTs) return p;
    unvoidedPurchases.push(p);
    return restoreActivePurchaseFromVoid(p);
  });

  return {
    sales: nextSales,
    purchases: nextPurchases,
    unvoidedSales: unvoidedSales,
    unvoidedPurchases: unvoidedPurchases,
  };
}

export function parentIdsFromReturns(returns, parentField) {
  var ids = {};
  (returns || []).forEach(function (r) {
    if (r && r[parentField] != null) ids[String(r[parentField])] = true;
  });
  return ids;
}

export function dropReturnsOnVoidedParents(sales, salesReturns, purchases, purchaseReturns) {
  var voidedSaleIds = {};
  (sales || []).forEach(function (s) {
    if (s && s.id != null && isVoidedTxn(s)) voidedSaleIds[String(s.id)] = true;
  });
  var voidedPurchaseIds = {};
  (purchases || []).forEach(function (p) {
    if (p && p.id != null && isVoidedTxn(p)) voidedPurchaseIds[String(p.id)] = true;
  });
  var strippedSalesReturns = [];
  var strippedPurchaseReturns = [];
  var keptSalesReturns = (salesReturns || []).filter(function (r) {
    if (r && r.invoiceId != null && voidedSaleIds[String(r.invoiceId)]) {
      strippedSalesReturns.push(r);
      return false;
    }
    return true;
  });
  var keptPurchaseReturns = (purchaseReturns || []).filter(function (r) {
    if (r && r.purchaseId != null && voidedPurchaseIds[String(r.purchaseId)]) {
      strippedPurchaseReturns.push(r);
      return false;
    }
    return true;
  });
  return {
    salesReturns: keptSalesReturns,
    purchaseReturns: keptPurchaseReturns,
    strippedSalesReturns: strippedSalesReturns,
    strippedPurchaseReturns: strippedPurchaseReturns,
  };
}

function collectVersions(localArr, remoteArr) {
  var byId = {};
  [localArr, remoteArr].forEach(function (arr) {
    (arr || []).forEach(function (row) {
      if (!row || row.id == null) return;
      var id = String(row.id);
      if (!byId[id]) byId[id] = [];
      byId[id].push(row);
    });
  });
  return byId;
}

export function preferActiveDocWhenReturnsExist(docs, parentIds, versionsById) {
  if (!parentIds || !Object.keys(parentIds).length) return docs || [];
  return (docs || []).map(function (doc) {
    if (!doc || doc.id == null) return doc;
    var id = String(doc.id);
    if (!parentIds[id] || !isVoidedTxn(doc)) return doc;
    var versions = versionsById[id] || [];
    var active = versions
      .filter(function (v) { return v && !isVoidedTxn(v); })
      .sort(function (a, b) { return recordSortTs(a).localeCompare(recordSortTs(b)); })
      .pop();
    return active || doc;
  });
}

/** Run after mergeServerStateWithLocal array merges. */
export function reconcileMergedVoidReturnState(out, localCache, serverData) {
  if (!out || typeof out !== "object") return out;
  var merged = Object.assign({}, out);
  var local = localCache || {};
  var remote = serverData || {};

  var saleReturnParents = parentIdsFromReturns(merged.tc3_salesReturns, "invoiceId");
  if (Object.keys(saleReturnParents).length) {
    merged.tc3_sales = preferActiveDocWhenReturnsExist(
      merged.tc3_sales,
      saleReturnParents,
      collectVersions(local.tc3_sales, remote.tc3_sales)
    );
  }

  var purReturnParents = parentIdsFromReturns(merged.tc3_purchaseReturns, "purchaseId");
  if (Object.keys(purReturnParents).length) {
    merged.tc3_purchases = preferActiveDocWhenReturnsExist(
      merged.tc3_purchases,
      purReturnParents,
      collectVersions(local.tc3_purchases, remote.tc3_purchases)
    );
  }

  var resolved = resolveVoidReturnConflictsByTimestamp(
    merged.tc3_sales,
    merged.tc3_salesReturns,
    merged.tc3_purchases,
    merged.tc3_purchaseReturns
  );
  merged.tc3_sales = resolved.sales;
  merged.tc3_purchases = resolved.purchases;

  var cleaned = dropReturnsOnVoidedParents(
    merged.tc3_sales,
    merged.tc3_salesReturns,
    merged.tc3_purchases,
    merged.tc3_purchaseReturns
  );
  merged.tc3_salesReturns = cleaned.salesReturns;
  merged.tc3_purchaseReturns = cleaned.purchaseReturns;

  return applyVoidReturnReconcileSideEffects(merged, {
    unvoidedSales: resolved.unvoidedSales || [],
    unvoidedPurchases: resolved.unvoidedPurchases || [],
    strippedSalesReturns: cleaned.strippedSalesReturns || [],
    strippedPurchaseReturns: cleaned.strippedPurchaseReturns || [],
  });
}
