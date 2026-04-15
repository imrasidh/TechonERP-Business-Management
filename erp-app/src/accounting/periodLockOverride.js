/**
 * When accounting admin bypass is active, detect edits that would violate strict period lock
 * and emit audit rows (append-only GL audit).
 */

function dateBeforeLock(d, lock) {
  return !!(d && lock && String(d) < String(lock));
}

/**
 * Collect affected record ids that strict period lock would have blocked.
 * Mirrors strict rules in App.jsx validateAccountingMutation (keep in sync when changing lock logic).
 */
export function collectStrictPeriodLockOverrideIds(k, v, oldV, settings) {
  var lock = settings && settings.lockedUntilDate;
  var strictLock = settings && settings.strictPeriodLock === true;
  var out = [];
  if (!lock || !strictLock) return out;

  var periodLockArrayKeys = {
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
  };

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
      if (!newIds[String(oDel.id)] && dateBeforeLock(oDel.date, lock)) {
        pushId(oDel);
      }
    }
    for (var li = 0; li < v.length; li++) {
      var nrow = v[li];
      if (!nrow) continue;
      var prevN = null;
      if (nrow.id != null) prevN = oldById[String(nrow.id)] || null;
      else if (li < oldArr.length && oldArr[li] && !nrow.id && !oldArr[li].id) prevN = oldArr[li];
      if (prevN && dateBeforeLock(prevN.date, lock)) {
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

  if (k === "tc3_openBal" && v && typeof v === "object") {
    var obOld = oldV && typeof oldV === "object" ? oldV : null;
    if (obOld && obOld.completed && obOld.date && dateBeforeLock(obOld.date, lock)) {
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
