/**
 * Inventory layers, stock movements, COGS from replay, and INV vs physical reconciliation.
 */

import { GL, round2 } from "./generalLedger.js";
import { stableJournalTransactionId } from "./ids.js";
import { purchaseInventoryNetFactor } from "../tax/taxCompute.js";
import { isVoidedTxn } from "../utils/voidInvoice.js";

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

var _sortSeqWarned = false;

function resolveRecordIsoDateTime(record, lineIdx) {
  if (!record) return "";
  var ts = record.isoDateTime || record.createdAt || record.billedAt || record.updatedAt || "";
  if (ts && String(ts).length >= 10) return String(ts);
  var d = String(record.date || "");
  if (!d) return "";
  var seqPad = String(lineIdx != null ? lineIdx : 0).padStart(6, "0");
  return d + "T12:00:00." + seqPad + "Z";
}

function sortEvents(a, b) {
  var da = String(a.date || "");
  var db = String(b.date || "");
  if (da !== db) return da.localeCompare(db);
  var ta = a.isoDateTime ? String(a.isoDateTime) : "";
  var tb = b.isoDateTime ? String(b.isoDateTime) : "";
  if (ta && tb && ta !== tb) return ta.localeCompare(tb);
  if (!ta && !tb && !_sortSeqWarned) {
    _sortSeqWarned = true;
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[inventoryEngine] Same-day events missing isoDateTime — falling back to _seq order.");
    }
  }
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

function normalizeText(v) {
  return String(v == null ? "" : v).trim().toLowerCase();
}

function findOpeningProductId(row, productsById, productsByBarcode, productsByName) {
  if (!row) return null;
  var pidRaw = row.productId != null ? row.productId : row.id;
  if (pidRaw != null && productsById[String(pidRaw)] != null) return String(pidRaw);
  var bc = normalizeText(row.barcode);
  if (bc && productsByBarcode[bc] != null) return productsByBarcode[bc];
  var nm = normalizeText(row.name);
  if (nm && productsByName[nm] != null) return productsByName[nm];
  return null;
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
  var runningInventoryValue = 0;

  var events = [];
  var productsById = {};
  var productsByBarcode = {};
  var productsByName = {};
  (state.products || []).forEach(function (p) {
    if (!p || p.id == null) return;
    var pid = String(p.id);
    productsById[pid] = p;
    var bc = normalizeText(p.barcode);
    if (bc && productsByBarcode[bc] == null) productsByBarcode[bc] = pid;
    var nm = normalizeText(p.name);
    if (nm && productsByName[nm] == null) productsByName[nm] = pid;
  });

  /* Opening stock is part of inventory replay (GL 1200 already includes it). */
  var ob = (state && state.openBal) || (S && typeof S.get === "function" ? S.get("tc3_openBal", null) : null);
  if (ob && ob.completed && Array.isArray(ob.stock)) {
    var obDate = String(ob.date || "");
    ob.stock.forEach(function (it, j) {
      if (!it) return;
      if (asOfDate && obDate && obDate > asOfDate) return;
      var pid = findOpeningProductId(it, productsById, productsByBarcode, productsByName);
      if (!pid) return;
      var q = Number(it.qty);
      var uc = Number(it.cost);
      if (!isFinite(q) || q <= 0) return;
      if (!isFinite(uc) || uc < 0) return;
      events.push({
        _seq: seq++,
        date: obDate,
        type: "open_in",
        productId: pid,
        qty: q,
        unitCost: round2(uc),
        referenceType: "opening_balance",
        referenceId: "ob-1",
        lineIdx: j,
      });
    });
  }

  (state.purchases || []).forEach(function (p) {
    if (isVoidedTxn(p)) return;
    if (asOfDate && String(p.date || "") > asOfDate) return;
    var purNetFactor = purchaseInventoryNetFactor(p, settings);
    var purIso = resolveRecordIsoDateTime(p);
    (p.items || []).forEach(function (it, j) {
      /* Stock and unit cost are always in base (storage) units on purchase lines */
      var q = Number(it.qty) || 0;
      if (q <= 0) return;
      events.push({
        _seq: seq++,
        date: p.date || "",
        isoDateTime: resolveRecordIsoDateTime(p, j) || purIso,
        type: "pur_in",
        productId: it.id,
        qty: q,
        unitCost: round2((it.cost || 0) * purNetFactor),
        referenceType: "purchase",
        referenceId: p.id,
        lineIdx: j,
      });
    });
  });

  /* Inventory-linked manual payables (e.g. 3rd party repair receive as one-time stock) */
  (state.manualPayables || (S && typeof S.get === "function" ? S.get("tc3_manualPayables", []) : []) || []).forEach(function (mp) {
    if (!mp || !mp.productId || mp._isOpening) return;
    if (mp.type !== "3rd Party Repair Cost" && !mp.thirdPartyRepairId) return;
    if (asOfDate && String(mp.date || "") > asOfDate) return;
    var qmp = Number(mp.qty || 1);
    var amp = round2(Number(mp.amount || 0));
    if (!isFinite(qmp) || qmp <= 0) return;
    if (!isFinite(amp) || amp <= 0) return;
    events.push({
      _seq: seq++,
      date: mp.date || "",
      isoDateTime: resolveRecordIsoDateTime(mp),
      type: "manual_payable_in",
      productId: mp.productId,
      qty: qmp,
      unitCost: round2(amp / qmp),
      referenceType: "manual_payable",
      referenceId: mp.id,
      lineIdx: 0,
    });
  });

  (state.sales || []).forEach(function (s) {
    if (isVoidedTxn(s)) return;
    if (asOfDate && String(s.date || "") > asOfDate) return;
    var saleIso = resolveRecordIsoDateTime(s);
    (s.items || []).forEach(function (it, j) {
      var q = Number(it.qty) || 0;
      if (q <= 0) return;
      var salePid = it.id != null ? String(it.id) : (it.productId != null ? String(it.productId) : "");
      var saleProduct = productsById[salePid] || null;
      if (saleProduct && String(saleProduct.type || "").toLowerCase() === "service") return; /* service line: no inventory movement */
      events.push({
        _seq: seq++,
        date: s.date || "",
        isoDateTime: resolveRecordIsoDateTime(s, j) || saleIso,
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
    var parentSale = (state.sales || []).find(function (s) { return s && s.id === r.invoiceId; });
    if (parentSale && isVoidedTxn(parentSale)) return;
    var q = Number(r.qty) || 0;
    if (q <= 0) return;
    events.push({
      _seq: seq++,
      date: r.date || "",
      isoDateTime: resolveRecordIsoDateTime(r),
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
    var purchase = (state.purchases || []).find(function (p) { return p && p.id === r.purchaseId; });
    if (purchase && isVoidedTxn(purchase)) return;
    var q = Number(r.qty) || 0;
    if (q <= 0) return;
    var purNetFactor = purchase ? purchaseInventoryNetFactor(purchase, settings) : 1;
    events.push({
      _seq: seq++,
      date: r.date || "",
      isoDateTime: resolveRecordIsoDateTime(r),
      type: "pur_out",
      productId: r.productId,
      qty: q,
      unitCost: round2((r.cost || 0) * purNetFactor),
      referenceType: "purchase_return",
      referenceId: r.id,
      lineIdx: 0,
    });
  });

  (state.damageLog || []).forEach(function (d) {
    if (!d || d.productId == null) return;
    if (asOfDate && String(d.date || "") > asOfDate) return;
    var qd = Number(d.qty) || 0;
    if (qd <= 0) return;
    var prod = productsById[String(d.productId)] || null;
    events.push({
      _seq: seq++,
      date: String(d.date || ""),
      isoDateTime: resolveRecordIsoDateTime(d),
      type: "damage_out",
      productId: d.productId,
      qty: qd,
      unitCost: round2(Number(prod && prod.cost) || Number(d.cost) || 0),
      referenceType: "damage",
      referenceId: d.id,
      lineIdx: 0,
    });
  });

  var productsByIdRm = productsById;
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

    if (ev.type === "open_in") {
      if (method === "fifo") {
        layersByProduct[pid].push({
          remainingQty: ev.qty,
          unitCost: ev.unitCost,
          sourceRef: ev.referenceId,
          batchTag: "opening_balance",
        });
      } else {
        layersByProduct[pid] = blendWac(layersByProduct[pid], ev.qty, round2(ev.qty * ev.unitCost));
      }
      runningInventoryValue = round2(runningInventoryValue + round2(ev.qty * ev.unitCost));
      movements.push({
        id: stableJournalTransactionId("stk", ev.referenceId, "open_in_" + ev.lineIdx),
        productId: pid,
        qtyIn: ev.qty,
        qtyOut: 0,
        unitCost: ev.unitCost,
        totalCost: round2(ev.qty * ev.unitCost),
        referenceType: ev.referenceType,
        referenceId: ev.referenceId,
        date: ev.date,
        journalTxnHint: stableJournalTransactionId("opening_balance", ev.referenceId, "inv"),
      });
      return;
    }

    if (ev.type === "pur_in" || ev.type === "manual_payable_in") {
      if (method === "fifo") {
        layersByProduct[pid].push({
          remainingQty: ev.qty,
          unitCost: ev.unitCost,
          sourceRef: ev.referenceId,
        });
      } else {
        layersByProduct[pid] = blendWac(layersByProduct[pid], ev.qty, round2(ev.qty * ev.unitCost));
      }
      runningInventoryValue = round2(runningInventoryValue + round2(ev.qty * ev.unitCost));
      movements.push({
        id: stableJournalTransactionId("stk", ev.referenceId, (ev.type === "manual_payable_in" ? "mp_in_" : "in_") + ev.lineIdx),
        productId: pid,
        qtyIn: ev.qty,
        qtyOut: 0,
        unitCost: ev.unitCost,
        totalCost: round2(ev.qty * ev.unitCost),
        referenceType: ev.referenceType,
        referenceId: ev.referenceId,
        date: ev.date,
        journalTxnHint: stableJournalTransactionId(ev.type === "manual_payable_in" ? "manual_payable" : "purchase", ev.referenceId, "inv"),
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
      runningInventoryValue = round2(runningInventoryValue - lineCost);
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
      runningInventoryValue = round2(runningInventoryValue - lineCostRm);
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

    if (ev.type === "damage_out") {
      var layersDmg = layersByProduct[pid].slice();
      var hadStockDmg = layersDmg.some(function (L) {
        return (L.remainingQty != null ? L.remainingQty : L.qty || 0) > 0.0001;
      });
      var consDmg = consumeFifo(layersDmg, ev.qty, pid);
      layersByProduct[pid] = consDmg.layers;
      var lineKeyDmg = "dmg:" + String(ev.referenceId || "") + ":" + ev.lineIdx;
      var lineCostDmg = consDmg.cost;
      if (lineCostDmg < 0.0001 && ev.qty > 0) {
        if (method === "fifo") {
          if (allowCostFallback) {
            lineCostDmg = round2(ev.qty * (ev.unitCost || 0));
            warnings.push("FIFO cost fallback used for damage " + lineKeyDmg);
          } else {
            blockingErrors.push("FIFO: no inventory layers for damage " + lineKeyDmg);
            lineCostDmg = 0;
          }
        } else {
          lineCostDmg = round2(ev.qty * (ev.unitCost || 0));
          if (!hadStockDmg && lineCostDmg > 0) {
            warnings.push("WAC: no layers — used product cost for damage " + lineKeyDmg);
          }
        }
      }
      runningInventoryValue = round2(runningInventoryValue - lineCostDmg);
      movements.push({
        id: stableJournalTransactionId("stk", "dmg_" + String(ev.referenceId || ""), "out"),
        productId: pid,
        qtyIn: 0,
        qtyOut: ev.qty,
        unitCost: ev.qty > 0 ? round2(lineCostDmg / ev.qty) : 0,
        totalCost: lineCostDmg,
        referenceType: "damage",
        referenceId: ev.referenceId,
        date: ev.date,
        journalTxnHint: stableJournalTransactionId("damage", ev.referenceId, "loss"),
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
      var retVal = round2(ev.qty * ucRet);
      runningInventoryValue = round2(runningInventoryValue + retVal);
      movements.push({
        id: stableJournalTransactionId("stk", ev.referenceId, "ret_in"),
        productId: pid,
        qtyIn: ev.qty,
        qtyOut: 0,
        unitCost: ev.unitCost,
        totalCost: retVal,
        referenceType: ev.referenceType,
        referenceId: ev.referenceId,
        date: ev.date,
      });
      return;
    }

    if (ev.type === "pur_out") {
      var consPr = consumeFifo(layersByProduct[pid].slice(), ev.qty, pid);
      layersByProduct[pid] = consPr.layers;
      var prVal = round2(ev.qty * round2(ev.unitCost || 0));
      if (consPr.cost < 0.0001 && ev.qty > 0) {
        if (method === "fifo") {
          if (allowCostFallback) {
            warnings.push("FIFO cost fallback used for purchase return " + String(ev.referenceId || "") + ":" + ev.lineIdx + " (allowCostFallback=true)");
          } else {
            blockingErrors.push("FIFO: no inventory layers for purchase return " + String(ev.referenceId || "") + ":" + ev.lineIdx + ". Purchase stock first or enable allowCostFallback.");
          }
        }
      }
      runningInventoryValue = round2(runningInventoryValue - prVal);
      movements.push({
        id: stableJournalTransactionId("stk", ev.referenceId, "pr_out"),
        productId: pid,
        qtyIn: 0,
        qtyOut: ev.qty,
        unitCost: ev.unitCost,
        totalCost: prVal,
        referenceType: ev.referenceType,
        referenceId: ev.referenceId,
        date: ev.date,
      });
    }
  });

  /* Ledger balance matches GL postings; layer qty×WAC can drift by pennies after many rounded sales. */
  var physicalValue = round2(runningInventoryValue);

  return {
    movements: movements,
    cogsBySaleId: cogsBySaleId,
    cogsBySaleLineKey: cogsBySaleLineKey,
    layersByProduct: layersByProduct,
    physicalInventoryValue: physicalValue,
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

/** WAC rounding tolerance for inventory vs GL (Rs). Override via settings.glInventoryReconcileTolerance. */
export function getInventoryReconcileTolerance(settings, physicalValue) {
  settings = settings || {};
  var custom = settings.glInventoryReconcileTolerance;
  if (custom != null && custom !== "" && !isNaN(Number(custom))) {
    return Math.max(0, round2(Number(custom)));
  }
  var phys = Math.abs(Number(physicalValue) || 0);
  return Math.max(50, round2(phys * 0.002));
}

export function isInventoryReconcileOk(rec, settings) {
  if (!rec) return false;
  if (rec.ok) return true;
  var tol = getInventoryReconcileTolerance(settings, rec.physicalValue);
  return Math.abs(rec.difference) <= tol;
}
