/**
 * Raw material daily flow helpers (opening / net receipts for a calendar date).
 * No schema changes — pure functions over existing state arrays.
 */

/**
 * Latest snapshot strictly before selectedDateStr that includes this product (best opening baseline).
 */
function findLatestPriorProductSnapshot(productId, selectedDateStr, rawCountRecordsSortedAsc) {
  if (!productId || !Array.isArray(rawCountRecordsSortedAsc)) return null;
  var sel = String(selectedDateStr || "");
  var best = null;
  for (var i = 0; i < rawCountRecordsSortedAsc.length; i++) {
    var rec = rawCountRecordsSortedAsc[i];
    var d = String(rec && rec.date || "");
    if (!d || d >= sel) continue;
    if (!rec || !Array.isArray(rec.items)) continue;
    var row = rec.items.find(function (x) {
      return x && String(x.productId) === String(productId);
    });
    if (!row) continue;
    if (!best || String(d) > String(best.date)) {
      best = {
        date: d,
        closingQty: Number(row.closingQty) || 0,
      };
    }
  }
  return best;
}

/**
 * Opening qty at start of selectedDate for raw material counts.
 *
 * @param priorClosingFromPrevSnapshot - closing from the UI's previous-day row when set; use undefined/null to derive from history.
 *   When null/undefined, opening = latest prior saved count (date \< selectedDate) for this product, or 0 with isMissingOpening.
 */
export function rawMaterialOpeningQty(
  priorClosingFromPrevSnapshot,
  productId,
  selectedDateStr,
  rawCountRecordsSortedAsc
) {
  if (priorClosingFromPrevSnapshot !== undefined && priorClosingFromPrevSnapshot !== null) {
    return {
      openingQty: Number(priorClosingFromPrevSnapshot) || 0,
      isMissingOpening: false,
    };
  }
  var sel = String(selectedDateStr || "");
  var latestPrior = findLatestPriorProductSnapshot(productId, sel, rawCountRecordsSortedAsc);
  if (!latestPrior) {
    return { openingQty: 0, isMissingOpening: true };
  }
  return { openingQty: latestPrior.closingQty, isMissingOpening: false };
}

/**
 * Gross purchased base qty on date from purchase invoices.
 */
export function grossPurchasedBaseQtyForDate(productId, dateStr, purchases) {
  return (purchases || []).reduce(function (acc, p) {
    if (String(p && p.date || "") !== String(dateStr || "")) return acc;
    var lineQty = (p.items || []).reduce(function (a, it) {
      var pid = it && (it.id || it.productId);
      return String(pid) === String(productId) ? a + (Number(it.qty) || 0) : a;
    }, 0);
    return acc + lineQty;
  }, 0);
}

/**
 * Base qty returned to suppliers on date (purchase returns).
 */
export function purchaseReturnsBaseQtyForDate(productId, dateStr, purchaseReturns) {
  return (purchaseReturns || []).reduce(function (a, r) {
    if (String(r && r.date || "") !== String(dateStr || "")) return a;
    if (!r || String(r.productId || "") !== String(productId || "")) return a;
    return a + (Number(r.qty) || 0);
  }, 0);
}

/**
 * Reserved for future stock corrections (manual +/-) not represented as purchases/returns.
 * Damage/waste is reflected in closing qty — do not subtract here or consumption double-counts.
 */
export function rawPurchaseAdjustmentDeduction(productId, dateStr, _state) {
  void productId;
  void dateStr;
  void _state;
  return 0;
}

/**
 * Net base qty from supplier activity on this date:
 * gross purchases − purchase returns − optional adjustment deduction (currently 0).
 * May be negative when returns exceed purchases on the same date.
 */
export function netPurchasedBaseQtyForDate(productId, dateStr, state) {
  var gross = grossPurchasedBaseQtyForDate(productId, dateStr, state && state.purchases);
  var ret = purchaseReturnsBaseQtyForDate(productId, dateStr, state && state.purchaseReturns);
  var adj = rawPurchaseAdjustmentDeduction(productId, dateStr, state);
  return gross - ret - adj;
}
