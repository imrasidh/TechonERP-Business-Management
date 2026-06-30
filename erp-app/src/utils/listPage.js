/** Default rows per page for ERP list tables (invoices, purchases, etc.). */
export var LIST_PAGE_SIZE = 25;

/** Newest records first — by date, then time/createdAt, then id. */
export function sortNewestFirst(items) {
  return (items || []).slice().sort(function (a, b) {
    var da = String(a.date || a.createdAt || "");
    var db = String(b.date || b.createdAt || "");
    if (da !== db) return da < db ? 1 : -1;
    var ta = String(a.time || a.createdAt || "");
    var tb = String(b.time || b.createdAt || "");
    if (ta !== tb) return ta < tb ? 1 : -1;
    var ia = String(a.id || "");
    var ib = String(b.id || "");
    return ia < ib ? 1 : -1;
  });
}
