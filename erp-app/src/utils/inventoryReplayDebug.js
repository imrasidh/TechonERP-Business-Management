/**
 * Dev-only inventory movement window for a product (uses deriveInventoryEconomics movements).
 */

import { round2 } from "../accounting/generalLedger.js";

/**
 * @param opts {{
 *   maxRows?: number,
 *   impactThreshold?: number,
 *   showImpactsOnly?: boolean,
 *   groupByDay?: boolean,
 *   highlightWacSteps?: boolean
 * }}
 */
export function buildInventoryReplayWindow(invDer, productId, fromDate, toDate, opts) {
  opts = opts || {};
  var maxRows = opts.maxRows != null ? opts.maxRows : 50000;
  var impactThreshold = opts.impactThreshold != null ? Number(opts.impactThreshold) : null;
  var showImpactsOnly = opts.showImpactsOnly === true;
  var groupByDay = opts.groupByDay === true;
  var highlightWacSteps = opts.highlightWacSteps === true;

  var pid = String(productId || "");
  var from = String(fromDate || "");
  var to = String(toDate || "");
  var mov = (invDer && invDer.movements ? invDer.movements : []).filter(function (m) {
    return String(m.productId || "") === pid;
  }).slice().sort(function (a, b) {
    var da = String(a.date || "");
    var db = String(b.date || "");
    if (da !== db) return da.localeCompare(db);
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
  var openingQty = 0;
  var i;
  for (i = 0; i < mov.length; i++) {
    var m0 = mov[i];
    var d0 = String(m0.date || "");
    if (d0 < from) {
      openingQty += (Number(m0.qtyIn) || 0) - (Number(m0.qtyOut) || 0);
    } else {
      break;
    }
  }
  openingQty = round2(openingQty);
  var run = openingQty;
  var rows = [];
  var lastPurchaseUnitCost = null;
  var method = invDer && invDer.method;

  for (i = 0; i < mov.length; i++) {
    var m = mov[i];
    var ds = String(m.date || "");
    if (ds < from) continue;
    if (ds > to) break;
    if (rows.length >= maxRows) break;
    var qin = Number(m.qtyIn) || 0;
    var qout = Number(m.qtyOut) || 0;
    run = round2(run + qin - qout);
    var uc = m.unitCost != null ? round2(m.unitCost) : null;
    var impactQty = Math.abs(qin - qout);
    var row = {
      date: m.date,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      qtyIn: qin,
      qtyOut: qout,
      unitCost: uc,
      totalCost: m.totalCost != null ? round2(m.totalCost) : null,
      closingQtyAfter: run,
      journalTxnHint: m.journalTxnHint || "",
      impactQty: impactQty,
    };
    if (highlightWacSteps && method === "wac" && String(m.referenceType || "") === "purchase" && qin > 0 && uc != null) {
      row.wacCostStep = lastPurchaseUnitCost != null && Math.abs(uc - lastPurchaseUnitCost) > 0.004;
      lastPurchaseUnitCost = uc;
    }
    rows.push(row);
  }

  if (showImpactsOnly && impactThreshold != null && !isNaN(impactThreshold)) {
    rows = rows.filter(function (rw) {
      return Math.abs(rw.impactQty || 0) > impactThreshold;
    });
  }

  var groups = null;
  if (groupByDay && rows.length) {
    groups = [];
    var bucket = null;
    rows.forEach(function (rw) {
      var d = String(rw.date || "").slice(0, 10);
      if (!bucket || bucket.date !== d) {
        if (bucket) groups.push(bucket);
        bucket = { date: d, netQtyDelta: 0, rowCount: 0 };
      }
      bucket.netQtyDelta = round2(bucket.netQtyDelta + (Number(rw.qtyIn) || 0) - (Number(rw.qtyOut) || 0));
      bucket.rowCount += 1;
    });
    if (bucket) groups.push(bucket);
  }

  return {
    productId: pid,
    from: from,
    to: to,
    openingQty: openingQty,
    closingQty: run,
    rows: rows,
    groupsByDay: groups,
    method: invDer && invDer.method,
  };
}
