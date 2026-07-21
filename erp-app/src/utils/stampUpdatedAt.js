/**
 * Stamp updatedAt on document mutations so multi-PC merge prefers the latest write.
 */
export function stampUpdatedAt(row, atIso) {
  if (!row || typeof row !== "object") return row;
  return Object.assign({}, row, { updatedAt: atIso || new Date().toISOString() });
}

/**
 * Stamp stockUpdatedAt (+ updatedAt) when product stock/cost changes.
 * Pass baseRow (pre-change product) so multi-PC merge can combine concurrent deltas
 * via stockBefore / stockBaseAt (see mergeRecordArrays.mergeProductRow).
 */
export function stampProductStock(row, atIso, baseRow) {
  if (!row || typeof row !== "object") return row;
  var ts = atIso || new Date().toISOString();
  var out = Object.assign({}, row, { updatedAt: ts, stockUpdatedAt: ts });
  if (baseRow && typeof baseRow === "object") {
    if (baseRow.stock != null) out.stockBefore = baseRow.stock;
    out.stockBaseAt = String(baseRow.stockUpdatedAt || baseRow.updatedAt || baseRow.createdAt || "");
  }
  return out;
}

/**
 * Stamp customer balance changes with credit/spent lineage for concurrent pay merge.
 */
export function stampCustomerBalance(row, atIso, baseRow) {
  if (!row || typeof row !== "object") return row;
  var ts = atIso || new Date().toISOString();
  var out = Object.assign({}, row, { updatedAt: ts });
  if (baseRow && typeof baseRow === "object") {
    if (baseRow.credit != null) out.creditBefore = baseRow.credit;
    if (baseRow.totalSpent != null) out.spentBefore = baseRow.totalSpent;
    out.creditBaseAt = String(baseRow.updatedAt || baseRow.createdAt || "");
    out.spentBaseAt = out.creditBaseAt;
  }
  return out;
}

/** Stable same-day ordering for inventory replay (prefer createdAt/updatedAt over date-only). */
export function stampTransactionIsoDateTime(row, atIso) {
  if (!row || typeof row !== "object") return row;
  if (row.isoDateTime && String(row.isoDateTime).length >= 19) return row;
  var ts = atIso || row.createdAt || row.updatedAt || new Date().toISOString();
  var d = String(row.date || "");
  if (d && String(ts).slice(0, 10) !== d) {
    ts = d + "T" + (String(ts).split("T")[1] || "12:00:00.000Z");
  }
  return Object.assign({}, row, { isoDateTime: ts });
}
