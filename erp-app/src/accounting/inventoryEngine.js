/**
 * Inventory layers, stock movements, COGS from replay, and INV vs physical reconciliation.
 */

import { GL, round2 } from "./generalLedger.js";
import { stableJournalTransactionId } from "./ids.js";

/** Persistable snapshot of layer stacks (productId → layers). */
export function serializeInventoryLayers(layersByProduct) {
  var out = {};
  Object.keys(layersByProduct || {}).forEach(function (pid) {
    out[pid] = (layersByProduct[pid] || []).map(function (L, idx) {
      return {
        id: L.id || ("L_" + pid + "_" + idx),
        remainingQty: round2(L.remainingQty != null ? L.remainingQty : L.qty || 0),
        unitCost: round2(L.unitCost != null ? L.unitCost : L.cost || 0),
        sourceRef: L.sourceRef || "",
        batchTag: L.batchTag || "",
      };
    });
  });
  return out;
}

function sortEvents(a, b) {
  var da = String(a.date || "");
  var db = String(b.date || "");
  if (da !== db) return da.localeCompare(db);
  return (a._seq || 0) - (b._seq || 0);
}

function consumeFifo(layers, qty, productId) {
  var need = qty;
  var cost = 0;
  var i = 0;
  while (need > 0.0001 && i < layers.length) {
    var L = layers[i];
    var rem = Math.max(0, L.remainingQty != null ? L.remainingQty : L.qty || 0);
    if (rem <= 0) {
      i++;
      continue;
    }
    var uc = round2(L.unitCost != null ? L.unitCost : L.cost || 0);
    var take = Math.min(need, rem);
    cost += round2(take * uc);
    L.remainingQty = round2(rem - take);
    need = round2(need - take);
    if (L.remainingQty <= 0.0001) i++;
  }
  return { cost: round2(cost), layers: layers.filter(function (x) { return (x.remainingQty || 0) > 0.0001; }) };
}

function blendWac(layers, addQty, addCost) {
  var totalQty = addQty;
  var totalVal = addCost;
  layers.forEach(function (L) {
    var q = L.remainingQty != null ? L.remainingQty : L.qty || 0;
    var uc = round2(L.unitCost != null ? L.unitCost : L.cost || 0);
    totalQty += q;
    totalVal += round2(q * uc);
  });
  if (totalQty <= 0) return [];
  var wac = round2(totalVal / totalQty);
  return [{ remainingQty: round2(totalQty), unitCost: wac, qty: round2(totalQty), source: "wac_blend" }];
}

/**
 * Full replay of inventory events → movements, COGS per sale, layer valuation, INV $.
 * opts.asOfDate — optional YYYY-MM-DD; only transactions on or before this date participate.
 */
export function deriveInventoryEconomics(state, S, opts) {
  opts = opts || {};
  var asOfDate = opts.asOfDate ? String(opts.asOfDate) : "";
  var settings = (state && state.settings) || {};
  var method = settings.inventoryCostingMethod === "fifo" ? "fifo" : "wac";
  var allowCostFallback = settings.allowCostFallback === true;
  var movements = [];
  var cogsBySaleId = {};
  var cogsBySaleLineKey = {};
  var layersByProduct = {};
  var seq = 0;
  var warnings = [];
  var blockingErrors = [];

  var events = [];

  (state.purchases || []).forEach(function (p) {
    if (asOfDate && String(p.date || "") > asOfDate) return;
    (p.items || []).forEach(function (it, j) {
      /* Stock and unit cost are always in base (storage) units on purchase lines */
      var q = Number(it.qty) || 0;
      if (q <= 0) return;
      events.push({
        _seq: seq++,
        date: p.date || "",
        type: "pur_in",
        productId: it.id,
        qty: q,
        unitCost: round2(it.cost || 0),
        referenceType: "purchase",
        referenceId: p.id,
        lineIdx: j,
      });
    });
  });

  (state.sales || []).forEach(function (s) {
    if (asOfDate && String(s.date || "") > asOfDate) return;
    (s.items || []).forEach(function (it, j) {
      var q = Number(it.qty) || 0;
      if (q <= 0) return;
      events.push({
        _seq: seq++,
        date: s.date || "",
        type: "sale_out",
        productId: it.id,
        qty: q,
        unitCost: round2(it.cost || 0),
        referenceType: "sale",
        referenceId: s.id,
        lineIdx: j,
      });
    });
  });

  (state.salesReturns || []).forEach(function (r) {
    if (asOfDate && String(r.date || "") > asOfDate) return;
    var q = Number(r.qty) || 0;
    if (q <= 0) return;
    events.push({
      _seq: seq++,
      date: r.date || "",
      type: "sale_in",
      productId: r.productId,
      qty: q,
      unitCost: round2(r.cost || 0),
      referenceType: "sales_return",
      referenceId: r.id,
      lineIdx: 0,
    });
  });

  (state.purchaseReturns || []).forEach(function (r) {
    if (asOfDate && String(r.date || "") > asOfDate) return;
    var q = Number(r.qty) || 0;
    if (q <= 0) return;
    events.push({
      _seq: seq++,
      date: r.date || "",
      type: "pur_out",
      productId: r.productId,
      qty: q,
      unitCost: round2(r.cost || 0),
      referenceType: "purchase_return",
      referenceId: r.id,
      lineIdx: 0,
    });
  });

  var productsByIdRm = {};
  (state.products || []).forEach(function (p) {
    if (p && p.id != null) productsByIdRm[String(p.id)] = p;
  });
  /* After purchases/sales/returns so same-day ordering consumes layers in that sequence */
  (state.rawMaterialUsages || []).forEach(function (u) {
    if (!u || u.productId == null) return;
    if (asOfDate && String(u.date || "") > asOfDate) return;
    var pr = productsByIdRm[String(u.productId)];
    if (!pr || String(pr.type || "").toLowerCase() !== "raw_material") return;
    var qb = Number(u.qtyBase);
    if (!isFinite(qb) || qb <= 0) return;
    events.push({
      _seq: seq++,
      date: String(u.date || ""),
      type: "rm_usage_out",
      productId: u.productId,
      qty: qb,
      unitCost: round2(Number(pr.cost) || 0),
      referenceType: "raw_material_usage",
      referenceId: u.id,
      lineIdx: 0,
    });
  });

  events.sort(sortEvents);

  events.forEach(function (ev) {
    var pid = ev.productId;
    if (!pid) return;
    if (!layersByProduct[pid]) layersByProduct[pid] = [];

    if (ev.type === "pur_in") {
      if (method === "fifo") {
        layersByProduct[pid].push({
          remainingQty: ev.qty,
          unitCost: ev.unitCost,
          sourceRef: ev.referenceId,
        });
      } else {
        layersByProduct[pid] = blendWac(layersByProduct[pid], ev.qty, round2(ev.qty * ev.unitCost));
      }
      movements.push({
        id: stableJournalTransactionId("stk", ev.referenceId, "in_" + ev.lineIdx),
        productId: pid,
        qtyIn: ev.qty,
        qtyOut: 0,
        unitCost: ev.unitCost,
        referenceType: ev.referenceType,
        referenceId: ev.referenceId,
        date: ev.date,
        journalTxnHint: stableJournalTransactionId("purchase", ev.referenceId, "inv"),
      });
      return;
    }

    if (ev.type === "sale_out") {
      var layers = layersByProduct[pid].slice();
      var hadStock = layers.some(function (L) {
        return (L.remainingQty != null ? L.remainingQty : L.qty || 0) > 0.0001;
      });
      var cons = consumeFifo(layers, ev.qty, pid);
      layersByProduct[pid] = cons.layers;
      var lineKey = String(ev.referenceId) + ":" + ev.lineIdx;
      var lineCost = cons.cost;
      if (lineCost < 0.0001 && ev.qty > 0) {
        if (method === "fifo") {
          if (allowCostFallback) {
            lineCost = round2(ev.qty * (ev.unitCost || 0));
            warnings.push("FIFO cost fallback used for sale line " + lineKey + " (allowCostFallback=true)");
          } else {
            blockingErrors.push("FIFO: no inventory layers to consume for product " + pid + " (sale line " + lineKey + "). Purchase stock first or enable allowCostFallback in Settings.");
            lineCost = 0;
          }
        } else {
          lineCost = round2(ev.qty * (ev.unitCost || 0));
          if (!hadStock && lineCost > 0) {
            warnings.push("WAC: no layers — used line cost for " + lineKey);
          }
        }
      }
      cogsBySaleLineKey[lineKey] = round2((cogsBySaleLineKey[lineKey] || 0) + lineCost);
      cogsBySaleId[ev.referenceId] = round2((cogsBySaleId[ev.referenceId] || 0) + lineCost);
      movements.push({
        id: stableJournalTransactionId("stk", ev.referenceId, "out_" + ev.lineIdx),
        productId: pid,
        qtyIn: 0,
        qtyOut: ev.qty,
        unitCost: ev.qty > 0 ? round2(lineCost / ev.qty) : 0,
        totalCost: lineCost,
        referenceType: ev.referenceType,
        referenceId: ev.referenceId,
        date: ev.date,
        journalTxnHint: stableJournalTransactionId("sale_cogs", ev.referenceId, "cogs"),
      });
      return;
    }

    if (ev.type === "rm_usage_out") {
      var layersRm = layersByProduct[pid].slice();
      var hadStockRm = layersRm.some(function (L) {
        return (L.remainingQty != null ? L.remainingQty : L.qty || 0) > 0.0001;
      });
      var consRm = consumeFifo(layersRm, ev.qty, pid);
      layersByProduct[pid] = consRm.layers;
      var lineKeyRm = "rmu:" + String(ev.referenceId || "") + ":" + ev.lineIdx;
      var lineCostRm = consRm.cost;
      if (lineCostRm < 0.0001 && ev.qty > 0) {
        if (method === "fifo") {
          if (allowCostFallback) {
            lineCostRm = round2(ev.qty * (ev.unitCost || 0));
            warnings.push("FIFO cost fallback used for raw material usage " + lineKeyRm + " (allowCostFallback=true)");
          } else {
            blockingErrors.push("FIFO: no inventory layers for raw material usage " + lineKeyRm + ". Purchase stock first or enable allowCostFallback.");
            lineCostRm = 0;
          }
        } else {
          lineCostRm = round2(ev.qty * (ev.unitCost || 0));
          if (!hadStockRm && lineCostRm > 0) {
            warnings.push("WAC: no layers — used product cost for raw material usage " + lineKeyRm);
          }
        }
      }
      movements.push({
        id: stableJournalTransactionId("stk", "rmu_" + String(ev.referenceId || ""), "out"),
        productId: pid,
        qtyIn: 0,
        qtyOut: ev.qty,
        unitCost: ev.qty > 0 ? round2(lineCostRm / ev.qty) : 0,
        totalCost: lineCostRm,
        referenceType: "raw_material_usage",
        referenceId: ev.referenceId,
        date: ev.date,
        journalTxnHint: stableJournalTransactionId("raw_material_usage", ev.referenceId, "cogs"),
      });
      return;
    }

    if (ev.type === "sale_in") {
      var ucRet = round2(ev.unitCost || 0);
      if (method === "fifo") {
        var stack = layersByProduct[pid];
        var merged = false;
        for (var mi = 0; mi < stack.length; mi++) {
          var ex = stack[mi];
          var exUc = round2(ex.unitCost != null ? ex.unitCost : ex.cost || 0);
          if (Math.abs(exUc - ucRet) < 0.02) {
            ex.remainingQty = round2((ex.remainingQty != null ? ex.remainingQty : ex.qty || 0) + ev.qty);
            merged = true;
            break;
          }
        }
        if (!merged) {
          stack.push({
            remainingQty: ev.qty,
            unitCost: ucRet,
            sourceRef: "sales_return",
            batchTag: String(ev.referenceId || ""),
          });
        }
      } else {
        layersByProduct[pid] = blendWac(layersByProduct[pid], ev.qty, round2(ev.qty * ucRet));
      }
      movements.push({
        id: stableJournalTransactionId("stk", ev.referenceId, "ret_in"),
        productId: pid,
        qtyIn: ev.qty,
        qtyOut: 0,
        unitCost: ev.unitCost,
        referenceType: ev.referenceType,
        referenceId: ev.referenceId,
        date: ev.date,
      });
      return;
    }

    if (ev.type === "pur_out") {
      var L2 = layersByProduct[pid].slice();
      var need2 = ev.qty;
      var i = 0;
      while (need2 > 0.0001 && i < L2.length) {
        var L = L2[i];
        var rem = Math.max(0, L.remainingQty != null ? L.remainingQty : L.qty || 0);
        if (rem <= 0) {
          i++;
          continue;
        }
        var take = Math.min(need2, rem);
        L.remainingQty = round2(rem - take);
        need2 = round2(need2 - take);
        if (L.remainingQty <= 0.0001) i++;
      }
      layersByProduct[pid] = L2.filter(function (x) { return (x.remainingQty || 0) > 0.0001; });
      movements.push({
        id: stableJournalTransactionId("stk", ev.referenceId, "pr_out"),
        productId: pid,
        qtyIn: 0,
        qtyOut: ev.qty,
        unitCost: ev.unitCost,
        referenceType: ev.referenceType,
        referenceId: ev.referenceId,
        date: ev.date,
      });
    }
  });

  var physicalValue = 0;
  Object.keys(layersByProduct).forEach(function (pid) {
    (layersByProduct[pid] || []).forEach(function (L) {
      var q = L.remainingQty != null ? L.remainingQty : L.qty || 0;
      var uc = round2(L.unitCost != null ? L.unitCost : L.cost || 0);
      physicalValue += round2(q * uc);
    });
  });

  return {
    movements: movements,
    cogsBySaleId: cogsBySaleId,
    cogsBySaleLineKey: cogsBySaleLineKey,
    layersByProduct: layersByProduct,
    physicalInventoryValue: round2(physicalValue),
    warnings: warnings,
    blockingErrors: blockingErrors,
    allowCostFallback: allowCostFallback,
    method: method,
    serializedLayers: serializeInventoryLayers(layersByProduct),
    asOfDate: asOfDate || null,
  };
}

export function getCOGSForSaleFromDerive(saleId, invDer) {
  if (!invDer || !invDer.cogsBySaleId) return null;
  var v = invDer.cogsBySaleId[saleId];
  return v != null ? round2(v) : null;
}

/**
 * GL balance for inventory (1200) using only lines on or before asOfDate (inclusive).
 */
export function inventoryAccountBalanceThroughDate(lines, chart, asOfDate) {
  var cut = asOfDate ? String(asOfDate) : "9999-12-31";
  var meta = {};
  (chart || []).forEach(function (a) { meta[a.id] = a; });
  var invRow = meta[GL.INV] || { normal: "debit" };
  var d = 0;
  var c = 0;
  (lines || []).forEach(function (ln) {
    if (ln.accountId !== GL.INV) return;
    if (String(ln.date || "") > cut) return;
    d += round2(ln.debit || 0);
    c += round2(ln.credit || 0);
  });
  return invRow.normal === "credit" ? round2(c - d) : round2(d - c);
}

/**
 * Compare GL inventory account balance to derived physical inventory value.
 */
export function reconcileInventoryToLedger(lines, invDer, chart) {
  var meta = {};
  (chart || []).forEach(function (a) { meta[a.id] = a; });
  var invRow = meta[GL.INV] || { normal: "debit" };
  var d = 0;
  var c = 0;
  (lines || []).forEach(function (ln) {
    if (ln.accountId !== GL.INV) return;
    d += round2(ln.debit || 0);
    c += round2(ln.credit || 0);
  });
  var invBal = invRow.normal === "credit" ? round2(c - d) : round2(d - c);
  var phys = invDer && invDer.physicalInventoryValue != null ? invDer.physicalInventoryValue : 0;
  var diff = round2(invBal - phys);
  return {
    ok: Math.abs(diff) < 0.02,
    glInventoryBalance: invBal,
    physicalValue: phys,
    difference: diff,
  };
}
