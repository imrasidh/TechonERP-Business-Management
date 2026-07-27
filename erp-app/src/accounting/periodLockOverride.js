import { isLockedThroughDate } from "./periodLockDates.js";
export var PERIOD_LOCK_ARRAY_KEYS = {
  tc3_sales: 1,
  tc3_purchases: 1,
  tc3_expenses: 1,
  tc3_salesReturns: 1,
  tc3_purchaseReturns: 1,
  tc3_manualReceivables: 1,
  tc3_manualPayables: 1,
  tc3_capLedger: 1,
  tc3_assets: 1,
  tc3_profitDist: 1,
  tc3_raw_material_usage: 1,
  tc3_raw_material_counts: 1,
  tc3_repairs: 1,
  tc3_cheques: 1,
  tc3_damageLog: 1,
};

export function periodLockRowDate(row, key) {
  if (!row) return "";
  if (key === "tc3_repairs") return row.dateIn || row.date || "";
  if (key === "tc3_cheques") return row.clearedDate || row.issuedDate || row.dueDate || row.date || "";
  return row.date || "";
}

/** True when product unit cost changed (period-lock guard — stock moves via sales/damageLog). */
export function productCostChanged(prev, row) {
  if (!prev || !row) return false;
  return Math.abs((Number(prev.cost) || 0) - (Number(row.cost) || 0)) > 1e-9;
}

/** True when product stock qty changed outside sales/purchases/damage (manual adjustment). */
export function productStockChanged(prev, row) {
  if (!prev || !row) return false;
  return Math.abs((Number(prev.stock) || 0) - (Number(row.stock) || 0)) > 1e-9;
}

/**
 * Collect affected record ids that strict period lock would have blocked.
 * Uses PERIOD_LOCK_ARRAY_KEYS / periodLockRowDate (shared with App.jsx).
 */
export function collectStrictPeriodLockOverrideIds(k, v, oldV, settings) {
  var lock = settings && settings.lockedUntilDate;
  var strictLock = settings && settings.strictPeriodLock === true;
  var out = [];
  if (!lock || !strictLock) return out;

  var periodLockArrayKeys = PERIOD_LOCK_ARRAY_KEYS;

  function pushId(row) {
    if (row && row.id != null) out.push(String(row.id));
    else out.push("(no-id)");
  }

  if (periodLockArrayKeys[k] && Array.isArray(v)) {
    var oldArr = Array.isArray(oldV) ? oldV : [];
    var oldById = {};
    for (var oi = 0; oi < oldArr.length; oi++) {
      var oRow = oldArr[oi];
      if (oRow && oRow.id != null) oldById[String(oRow.id)] = oRow;
    }
    var newIds = {};
    for (var ni = 0; ni < v.length; ni++) {
      var nv = v[ni];
      if (nv && nv.id != null) newIds[String(nv.id)] = true;
    }
    for (var od = 0; od < oldArr.length; od++) {
      var oDel = oldArr[od];
      if (!oDel || oDel.id == null) continue;
      if (!newIds[String(oDel.id)] && isLockedThroughDate(periodLockRowDate(oDel, k), lock)) {
        pushId(oDel);
      }
    }
    for (var li = 0; li < v.length; li++) {
      var nrow = v[li];
      if (!nrow) continue;
      var prevN = null;
      if (nrow.id != null) prevN = oldById[String(nrow.id)] || null;
      else if (li < oldArr.length && oldArr[li] && !nrow.id && !oldArr[li].id) prevN = oldArr[li];
      if (prevN && isLockedThroughDate(periodLockRowDate(prevN, k), lock)) {
        try {
          if (JSON.stringify(prevN) !== JSON.stringify(nrow)) {
            pushId(nrow);
          }
        } catch (e) {
          pushId(nrow);
        }
      }
    }
  }

  if (k === "tc3_products" && Array.isArray(v)) {
    var oldProdArr = Array.isArray(oldV) ? oldV : [];
    var oldProdById = {};
    for (var opi = 0; opi < oldProdArr.length; opi++) {
      var oPr = oldProdArr[opi];
      if (oPr && oPr.id != null) oldProdById[String(oPr.id)] = oPr;
    }
    var newProdIds = {};
    for (var npi = 0; npi < v.length; npi++) {
      var nPr = v[npi];
      if (nPr && nPr.id != null) newProdIds[String(nPr.id)] = true;
    }
    for (var opd = 0; opd < oldProdArr.length; opd++) {
      var oDelP = oldProdArr[opd];
      if (!oDelP || oDelP.id == null) continue;
      if (!newProdIds[String(oDelP.id)]) {
        pushId(oDelP);
      }
    }
    for (var pxi = 0; pxi < v.length; pxi++) {
      var nProd = v[pxi];
      if (!nProd || nProd.id == null) continue;
      var prevProd = oldProdById[String(nProd.id)];
      if (!prevProd) continue;
      if (productCostChanged(prevProd, nProd)) {
        pushId(nProd);
      }
    }
  }

  if (k === "tc3_openBal" && v && typeof v === "object") {
    var obOld = oldV && typeof oldV === "object" ? oldV : null;
    if (obOld && obOld.completed && obOld.date && isLockedThroughDate(obOld.date, lock)) {
      try {
        if (JSON.stringify(obOld) !== JSON.stringify(v)) {
          out.push("tc3_openBal");
        }
      } catch (e) {
        out.push("tc3_openBal");
      }
    }
  }

  /* Dedupe */
  var seen = {};
  return out.filter(function (id) {
    if (seen[id]) return false;
    seen[id] = true;
    return true;
  });
}

/**
 * On LAN pull, keep local copies of period-locked rows so sync cannot mutate closed periods.
 */
export function preserveLockedPeriodRowsOnPull(localArr, mergedArr, key, lockUntil) {
  if (!lockUntil || !PERIOD_LOCK_ARRAY_KEYS[key]) return mergedArr;
  var local = Array.isArray(localArr) ? localArr : [];
  var merged = Array.isArray(mergedArr) ? mergedArr : [];
  var localById = {};
  local.forEach(function (row) {
    if (row && row.id != null) localById[String(row.id)] = row;
  });
  var mergedIds = {};
  var out = merged.map(function (row) {
    if (!row || row.id == null) return row;
    mergedIds[String(row.id)] = true;
    var prev = localById[String(row.id)];
    if (!prev) return row;
    if (isLockedThroughDate(periodLockRowDate(prev, key), lockUntil)) {
      try {
        if (JSON.stringify(prev) !== JSON.stringify(row)) return prev;
      } catch (_e) {
        return prev;
      }
    }
    return row;
  });
  local.forEach(function (row) {
    if (!row || row.id == null) return;
    if (mergedIds[String(row.id)]) return;
    if (isLockedThroughDate(periodLockRowDate(row, key), lockUntil)) {
      out.push(row);
    }
  });
  return out;
}
