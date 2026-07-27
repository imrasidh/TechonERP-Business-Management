/**
 * Post-merge guards for server pull hydration (bypasses S.set RBAC).
 * Standalone / network server: never let a remote snapshot overwrite local auth secrets.
 */

var PROTECTED_AUTH_KEYS = {
  tc3_users: true,
  tc3_apppass: true,
  tc3_admin_name: true,
};

export function sanitizeMergedPullState(merged, localCache) {
  if (!merged || typeof merged !== "object") return merged;
  var role = "";
  try {
    role = typeof window !== "undefined" ? String(window._tcNetRole || "") : "";
  } catch (_e) {}
  if (role === "network_client") return merged;

  var out = Object.assign({}, merged);
  localCache = localCache && typeof localCache === "object" ? localCache : {};

  Object.keys(PROTECTED_AUTH_KEYS).forEach(function (k) {
    if (localCache[k] !== undefined) out[k] = localCache[k];
  });

  if (out.tc3_settings && localCache.tc3_settings && typeof localCache.tc3_settings === "object") {
    var ls = localCache.tc3_settings;
    var rs = out.tc3_settings;
    out.tc3_settings = Object.assign({}, rs, {
      adminPin: ls.adminPin != null ? ls.adminPin : rs.adminPin,
      mainAdminPassHash: ls.mainAdminPassHash || rs.mainAdminPassHash,
      requirePasswordOnLogin: ls.requirePasswordOnLogin != null ? ls.requirePasswordOnLogin : rs.requirePasswordOnLogin,
      allowAdminPasswordElevation: ls.allowAdminPasswordElevation != null ? ls.allowAdminPasswordElevation : rs.allowAdminPasswordElevation,
    });
  }

  return out;
}

function sanitizeSalePaymentsOnPull(sale) {
  if (!sale || typeof sale !== "object") return sale;
  var total = Number(sale.total) || 0;
  var ph = Array.isArray(sale.paymentHistory) ? sale.paymentHistory : [];
  if (!ph.length) return sale;
  var cleaned = [];
  ph.forEach(function (p) {
    if (!p || typeof p !== "object") return;
    var amt = Number(p.amount) || 0;
    if (amt < 0 || !isFinite(amt)) return;
    if (amt > total * 2 + 0.01) amt = total;
    cleaned.push(Object.assign({}, p, { amount: Math.round(amt * 100) / 100 }));
  });
  var phSum = cleaned.reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0);
  var paidCap = Math.min(phSum, total);
  var bal = Math.round((total - paidCap) * 100) / 100;
  return Object.assign({}, sale, {
    paymentHistory: cleaned,
    paid: paidCap,
    balance: bal,
    payStatus: bal <= 0 ? "Paid" : (paidCap > 0 ? "Partial" : (sale.payStatus || "Unpaid")),
  });
}

/** Network clients: clamp malicious / merged payment rows from server pull. */
export function sanitizeClientPullDocuments(merged) {
  if (!merged || typeof merged !== "object") return merged;
  var role = "";
  try {
    role = typeof window !== "undefined" ? String(window._tcNetRole || "") : "";
  } catch (_e) {}
  if (role !== "network_client") return merged;
  var out = Object.assign({}, merged);
  if (Array.isArray(out.tc3_sales)) {
    out.tc3_sales = out.tc3_sales.map(function (s) { return sanitizeSalePaymentsOnPull(s); });
  }
  if (Array.isArray(out.tc3_purchases)) {
    out.tc3_purchases = out.tc3_purchases.map(function (p) {
      if (!p || typeof p !== "object") return p;
      var ph = Array.isArray(p.paymentHistory) ? p.paymentHistory : [];
      if (!ph.length) return p;
      var cleaned = ph.filter(function (row) {
        return row && typeof row === "object" && (Number(row.amount) || 0) >= 0;
      });
      return Object.assign({}, p, { paymentHistory: cleaned });
    });
  }
  return out;
}
