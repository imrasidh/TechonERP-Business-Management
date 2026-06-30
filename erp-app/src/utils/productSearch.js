/**
 * Shared product lookup for pickers and list filters (name, barcode, category, productId).
 */

export function productMatchesSearch(product, query) {
  var q = String(query == null ? "" : query).trim().toLowerCase();
  if (!q || !product) return false;
  return (
    String(product.name || "").toLowerCase().includes(q) ||
    String(product.barcode || "").toLowerCase().includes(q) ||
    String(product.category || "").toLowerCase().includes(q) ||
    String(product.productId || "").toLowerCase().includes(q)
  );
}

/** Case-insensitive exact match on name, barcode, or display productId. */
export function productMatchesSearchExact(product, query) {
  var q = String(query == null ? "" : query).trim().toLowerCase();
  if (!q || !product) return false;
  return (
    String(product.name || "").toLowerCase() === q ||
    String(product.barcode || "").toLowerCase() === q ||
    String(product.productId || "").toLowerCase() === q
  );
}

/** First non-inactive product with an exact search hit, or null. */
export function findActiveProductByExactSearch(products, query) {
  var q = String(query == null ? "" : query).trim();
  if (!q) return null;
  var list = products || [];
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (p && p.status !== "inactive" && productMatchesSearchExact(p, q)) return p;
  }
  return null;
}
