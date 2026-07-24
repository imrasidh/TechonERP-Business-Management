/**
 * Multi-PC concurrency helpers: refresh mergeable arrays from server before
 * money mutations, and validate payment amounts against a fresh balance.
 */
import { mergeRecordArraysByNewest } from "./mergeRecordArrays.js";
import { loadStateFromServer, setSyncHydrating } from "../sync/SyncEngine.js";

function getNetworkAuthConfig() {
  try {
    if (typeof window === "undefined") return null;
    var cfg = window._tcNetSyncConfig || window._tcSystemConfig || null;
    if (!cfg || !cfg.apiUrl) return null;
    var role = String(cfg.role || "").trim();
    if (role !== "network_server" && role !== "network_client") return null;
    return cfg;
  } catch (_e) {
    return null;
  }
}

function applyArrayToLocalCache(key, rows) {
  try {
    if (typeof window !== "undefined" && window._idbCache) {
      window._idbCache[key] = rows;
    }
  } catch (_e) { /* ignore */ }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, JSON.stringify(rows));
    }
  } catch (_e2) { /* ignore */ }
}

/**
 * Pull one mergeable array from MySQL and merge into local cache.
 * No-op (returns local) when not on a network role.
 */
export async function refreshMergeableKeyFromServer(S, key) {
  var local = (S && typeof S.get === "function") ? (S.get(key, []) || []) : [];
  if (!Array.isArray(local)) local = [];
  var cfg = getNetworkAuthConfig();
  if (!cfg) return local;
  try {
    var data = await loadStateFromServer(cfg.apiUrl, [key], { authConfig: cfg });
    var remote = data && data[key];
    if (!Array.isArray(remote)) return local;
    var merged = mergeRecordArraysByNewest(local, remote, key);
    setSyncHydrating(true);
    try {
      applyArrayToLocalCache(key, merged);
      if (S && typeof S.set === "function") {
        try { S.set(key, merged); } catch (_e) { /* ignore */ }
      }
    } finally {
      setSyncHydrating(false);
    }
    return merged;
  } catch (_e) {
    return local;
  }
}

export function findRowById(rows, id) {
  if (id == null || id === "") return null;
  var sid = String(id);
  var list = Array.isArray(rows) ? rows : [];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && String(list[i].id) === sid) return list[i];
  }
  return null;
}

/**
 * Ensure a payment amount still fits the invoice balance (fresh sale preferred).
 * Returns { ok, sale, message }.
 * opts.includePendingCheques — also subtract Pending cheque amounts already on this sale
 *   (use when creating new cheques so clear-time won't leave stuck over-amount cheques).
 * opts.cheques — cheque register array when includePendingCheques is set.
 */
export function assertPaymentFitsSaleBalance(sale, amount, opts) {
  opts = opts || {};
  if (!sale) return { ok: false, sale: null, message: "Invoice not found. Refresh and try again." };
  var amt = parseFloat(amount) || 0;
  if (amt < 0) return { ok: false, sale: sale, message: "Payment amount cannot be negative." };
  /* Cheque / note-only paths may pass amount 0 */
  if (opts.allowZero) return { ok: true, sale: sale };
  var total = parseFloat(sale.total) || 0;
  var paid = parseFloat(sale.paid) || 0;
  var bal = Math.round((total - paid) * 100) / 100;
  if (opts.includePendingCheques) {
    var pending = 0;
    (opts.cheques || []).forEach(function (ch) {
      if (!ch || String(ch.saleId) !== String(sale.id)) return;
      if (String(ch.status || "") !== "Pending") return;
      pending += parseFloat(ch.amount) || 0;
    });
    bal = Math.round((bal - pending) * 100) / 100;
  }
  if (amt > bal + 0.009) {
    return {
      ok: false,
      sale: sale,
      message: opts.includePendingCheques
        ? "Cheque total exceeds remaining invoice balance (due " + Math.max(0, bal) + "). Reduce cheque amount(s)."
        : "Balance changed on another counter (due " + bal + "). Refresh the invoice and try again.",
    };
  }
  return { ok: true, sale: sale, balance: bal };
}

export function assertPaymentFitsPurchaseBalance(purchase, amount, opts) {
  opts = opts || {};
  if (!purchase) return { ok: false, purchase: null, message: "Purchase not found. Refresh and try again." };
  var amt = parseFloat(amount) || 0;
  if (amt < 0) return { ok: false, purchase: purchase, message: "Payment amount cannot be negative." };
  if (opts.allowZero) return { ok: true, purchase: purchase };
  var total = parseFloat(purchase.total) || 0;
  var paid = parseFloat(purchase.paidAmount) || 0;
  var bal = Math.round((total - paid) * 100) / 100;
  if (opts.includePendingCheques) {
    var pending = 0;
    (opts.cheques || []).forEach(function (ch) {
      if (!ch || String(ch.purchaseId) !== String(purchase.id)) return;
      if (String(ch.status || "") !== "Pending") return;
      pending += parseFloat(ch.amount) || 0;
    });
    bal = Math.round((bal - pending) * 100) / 100;
  }
  if (amt > bal + 0.009) {
    return {
      ok: false,
      purchase: purchase,
      message: opts.includePendingCheques
        ? "Cheque total exceeds remaining purchase balance (due " + Math.max(0, bal) + "). Reduce cheque amount(s)."
        : "Balance changed on another counter (due " + bal + "). Refresh and try again.",
    };
  }
  return { ok: true, purchase: purchase, balance: bal };
}

/**
 * Cap payments against a manual receivable/payable outstanding balance.
 * item: { amount, paid } or raw row with paymentHistory (paid computed if missing).
 */
export function assertPaymentFitsManualBalance(item, amount, opts) {
  opts = opts || {};
  if (!item) return { ok: false, message: "Record not found. Refresh and try again." };
  var amt = parseFloat(amount) || 0;
  if (amt < 0) return { ok: false, message: "Payment amount cannot be negative." };
  if (opts.allowZero) return { ok: true, balance: 0 };
  var total = parseFloat(item.amount) || 0;
  var paid = item.paid != null ? parseFloat(item.paid) || 0 : 0;
  if (item.paid == null && Array.isArray(item.paymentHistory)) {
    paid = (item.paymentHistory || []).reduce(function (a, ph) {
      return a + (parseFloat(ph && ph.amount) || 0);
    }, 0);
  }
  var bal = Math.round((total - paid) * 100) / 100;
  if (opts.includePendingCheques) {
    var idField = opts.chequeLinkField || "manualReceivableId";
    var pending = 0;
    (opts.cheques || []).forEach(function (ch) {
      if (!ch || String(ch[idField] || "") !== String(item.id)) return;
      if (String(ch.status || "") !== "Pending") return;
      pending += parseFloat(ch.amount) || 0;
    });
    bal = Math.round((bal - pending) * 100) / 100;
  }
  if (amt > bal + 0.009) {
    return {
      ok: false,
      message: opts.includePendingCheques
        ? "Amount exceeds remaining balance (due " + Math.max(0, bal) + ") including pending cheques."
        : "Amount exceeds remaining balance (due " + Math.max(0, bal) + ").",
      balance: bal,
    };
  }
  return { ok: true, balance: bal };
}

/**
 * Network-safe: refresh sales, return fresh sale for payment.
 */
export async function loadFreshSaleForPayment(S, saleId) {
  var sales = await refreshMergeableKeyFromServer(S, "tc3_sales");
  return { sales: sales, sale: findRowById(sales, saleId) };
}

export async function loadFreshPurchaseForPayment(S, purchaseId) {
  var purchases = await refreshMergeableKeyFromServer(S, "tc3_purchases");
  return { purchases: purchases, purchase: findRowById(purchases, purchaseId) };
}

export async function loadFreshProductsForStock(S) {
  var products = await refreshMergeableKeyFromServer(S, "tc3_products");
  return products;
}

/** Fire-and-forget immediate push — batches keys in ONE request so sale/cheque clears stay atomic. */
export function pushKeysNow(keysAndValues) {
  try {
    var syncBatch = null;
    if (typeof window !== "undefined" && window.TC_SYNC && typeof window.TC_SYNC.syncStorageKeysNow === "function") {
      syncBatch = window.TC_SYNC.syncStorageKeysNow.bind(window.TC_SYNC);
    }
    if (!syncBatch) {
      var syncNow = null;
      if (typeof window !== "undefined" && window.TC_SYNC && typeof window.TC_SYNC.syncStorageKeyNow === "function") {
        syncNow = window.TC_SYNC.syncStorageKeyNow.bind(window.TC_SYNC);
      }
      if (!syncNow) return;
      (keysAndValues || []).forEach(function (pair) {
        if (!pair || !pair[0]) return;
        try { syncNow(pair[0], pair[1]); } catch (_e) { /* ignore */ }
      });
      return;
    }
    try { syncBatch(keysAndValues || []); } catch (_e2) { /* ignore */ }
  } catch (_e3) { /* ignore */ }
}
