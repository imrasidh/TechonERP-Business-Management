/**
 * Merge ERP record arrays by id — newest updatedAt/createdAt wins (multi-terminal sync).
 */

import { reconcileMergedVoidReturnState } from "./reconcileVoidReturns.js";

export var MERGEABLE_RECORD_ARRAY_KEYS = {
  tc3_sales: true,
  tc3_purchases: true,
  tc3_products: true,
  tc3_customers: true,
  tc3_suppliers: true,
  tc3_expenses: true,
  tc3_repairs: true,
  tc3_assets: true,
  tc3_salesReturns: true,
  tc3_purchaseReturns: true,
  tc3_quotations: true,
  tc3_cheques: true,
  tc3_manualReceivables: true,
  tc3_manualPayables: true,
  tc3_invoice_edit_locks: true,
  tc3_raw_material_usage: true,
  tc3_raw_material_counts: true,
  tc3_codRecords: true,
  tc3_codPartners: true,
  tc3_codWithdrawals: true,
  tc3_users: true,
};

function recordSortTs(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.updatedAt || row.createdAt || row.billedAt || row.date || "");
}

function stockSortTs(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.stockUpdatedAt || row.updatedAt || row.createdAt || "");
}

function paymentEntryKey(ph) {
  if (!ph || typeof ph !== "object") return "";
  if (ph.id != null && String(ph.id) !== "") return "id:" + String(ph.id);
  return "fp:" + [ph.date || "", ph.amount || 0, ph.cashMethod || "", ph.note || "", ph.chequeId || ""].join("|");
}

/** Union paymentHistory by payment id so concurrent Pays do not drop each other. */
export function unionPaymentHistory(aPh, bPh) {
  var byKey = {};
  var order = [];
  function ingest(arr) {
    (arr || []).forEach(function (ph) {
      if (!ph || typeof ph !== "object") return;
      var k = paymentEntryKey(ph);
      if (!k) return;
      if (!byKey[k]) {
        byKey[k] = ph;
        order.push(k);
        return;
      }
      /* Prefer entry with an id, else the one with newer-looking note/amount (cleared cheque). */
      var prev = byKey[k];
      if (ph.id != null && prev.id == null) byKey[k] = ph;
      else if ((parseFloat(ph.amount) || 0) > (parseFloat(prev.amount) || 0)) byKey[k] = ph;
    });
  }
  ingest(aPh);
  ingest(bPh);
  return order.map(function (k) { return byKey[k]; });
}

function sumPaymentHistoryAmounts(ph) {
  return (ph || []).reduce(function (s, p) {
    return s + (parseFloat(p && p.amount) || 0);
  }, 0);
}

function isVoidedDoc(row) {
  if (!row) return false;
  if (row.voided) return true;
  var st = String(row.status || row.payStatus || "").toLowerCase();
  return st === "voided";
}

/**
 * Sales/purchases: newest metadata wins, but paymentHistory is unioned by id
 * and paid/balance recalculated so dual-pay races keep both payments.
 * If concurrent full pays push phSum above total, paid is capped at total
 * (PH kept intact for audit — reverse the excess manually).
 */
export function mergeDocumentWithPaymentHistory(a, b, kind) {
  var preferB = recordSortTs(b) >= recordSortTs(a);
  var out = Object.assign({}, preferB ? a : b, preferB ? b : a);
  var aPh = Array.isArray(a.paymentHistory) ? a.paymentHistory : [];
  var bPh = Array.isArray(b.paymentHistory) ? b.paymentHistory : [];
  if (!aPh.length && !bPh.length) return out;

  var merged = unionPaymentHistory(aPh, bPh);
  out.paymentHistory = merged;
  if (isVoidedDoc(out)) return out;

  var phSum = Math.round(sumPaymentHistoryAmounts(merged) * 100) / 100;
  var total = parseFloat(out.total) || 0;
  var paidCap = Math.min(phSum, total);
  var bal = Math.round((total - paidCap) * 100) / 100;
  if (kind === "sale") {
    out.paid = paidCap;
    out.balance = bal;
    out.payStatus = bal <= 0 ? "Paid" : paidCap > 0 ? "Partial" : (out.payStatus || "Unpaid");
    if (phSum > total + 0.009) out.overpaidAmount = Math.round((phSum - total) * 100) / 100;
  } else if (kind === "purchase") {
    /* Purchases intentionally allow overpayment (supplier credit). */
    out.paidAmount = phSum;
    out.balance = Math.round((total - phSum) * 100) / 100;
    out.status = out.balance <= 0 ? "Paid" : phSum > 0 ? "Partial" : (out.status || "Unpaid");
  }
  return out;
}

/**
 * Products: metadata by updatedAt; stock/cost by stockUpdatedAt.
 * Concurrent forks (same stockBaseAt + stockBefore) combine deltas so two
 * counters selling from stock 10 both writing 9 resolve to 8.
 */
export function mergeProductRow(a, b) {
  var preferBMeta = recordSortTs(b) >= recordSortTs(a);
  var out = Object.assign({}, preferBMeta ? a : b, preferBMeta ? b : a);
  var aTs = stockSortTs(a);
  var bTs = stockSortTs(b);
  var aBase = a.stockBaseAt != null ? String(a.stockBaseAt) : "";
  var bBase = b.stockBaseAt != null ? String(b.stockBaseAt) : "";

  if (
    aBase &&
    aBase === bBase &&
    a.stockBefore != null &&
    b.stockBefore != null &&
    Math.abs(Number(a.stockBefore) - Number(b.stockBefore)) < 1e-9
  ) {
    var parentStock = Number(a.stockBefore);
    var dA = Number(a.stock) - Number(a.stockBefore);
    var dB = Number(b.stock) - Number(b.stockBefore);
    out.stock = parentStock + dA + dB;
    if (bTs >= aTs) {
      if (b.cost != null) out.cost = b.cost;
      if (b.stockUpdatedAt) out.stockUpdatedAt = b.stockUpdatedAt;
    } else {
      if (a.cost != null) out.cost = a.cost;
      if (a.stockUpdatedAt) out.stockUpdatedAt = a.stockUpdatedAt;
    }
    out.stockBefore = parentStock;
    out.stockBaseAt = aBase;
    return out;
  }

  /* Linear chain: child based on parent's stockUpdatedAt */
  if (bBase && bBase === String(a.stockUpdatedAt || "") && b.stock != null) {
    out.stock = b.stock;
    if (b.cost != null) out.cost = b.cost;
    if (b.stockUpdatedAt) out.stockUpdatedAt = b.stockUpdatedAt;
    if (b.stockBefore != null) out.stockBefore = b.stockBefore;
    if (b.stockBaseAt != null) out.stockBaseAt = b.stockBaseAt;
    return out;
  }
  if (aBase && aBase === String(b.stockUpdatedAt || "") && a.stock != null) {
    out.stock = a.stock;
    if (a.cost != null) out.cost = a.cost;
    if (a.stockUpdatedAt) out.stockUpdatedAt = a.stockUpdatedAt;
    if (a.stockBefore != null) out.stockBefore = a.stockBefore;
    if (a.stockBaseAt != null) out.stockBaseAt = a.stockBaseAt;
    return out;
  }

  if (bTs >= aTs) {
    out.stock = b.stock;
    out.cost = b.cost != null ? b.cost : out.cost;
    if (b.stockUpdatedAt) out.stockUpdatedAt = b.stockUpdatedAt;
    if (b.stockBefore != null) out.stockBefore = b.stockBefore;
    if (b.stockBaseAt != null) out.stockBaseAt = b.stockBaseAt;
  } else {
    out.stock = a.stock;
    out.cost = a.cost != null ? a.cost : out.cost;
    if (a.stockUpdatedAt) out.stockUpdatedAt = a.stockUpdatedAt;
    if (a.stockBefore != null) out.stockBefore = a.stockBefore;
    if (a.stockBaseAt != null) out.stockBaseAt = a.stockBaseAt;
  }
  return out;
}

function pickNewerRow(prev, row, storageKey) {
  if (storageKey === "tc3_products") return mergeProductRow(prev, row);
  if (storageKey === "tc3_sales") return mergeDocumentWithPaymentHistory(prev, row, "sale");
  if (storageKey === "tc3_purchases") return mergeDocumentWithPaymentHistory(prev, row, "purchase");
  if (storageKey === "tc3_customers") return mergeCustomerRow(prev, row);
  if (storageKey === "tc3_manualReceivables" || storageKey === "tc3_manualPayables") {
    return mergeManualWithPaymentHistory(prev, row);
  }
  return recordSortTs(row) >= recordSortTs(prev) ? row : prev;
}

/**
 * Manual AR/AP: newest metadata, paymentHistory unioned by id.
 */
export function mergeManualWithPaymentHistory(a, b) {
  var preferB = recordSortTs(b) >= recordSortTs(a);
  var out = Object.assign({}, preferB ? a : b, preferB ? b : a);
  var aPh = Array.isArray(a.paymentHistory) ? a.paymentHistory : [];
  var bPh = Array.isArray(b.paymentHistory) ? b.paymentHistory : [];
  if (aPh.length || bPh.length) {
    out.paymentHistory = unionPaymentHistory(aPh, bPh);
  }
  return out;
}

/**
 * Customers: metadata by updatedAt; credit/totalSpent combine concurrent deltas.
 */
export function mergeCustomerRow(a, b) {
  var preferBMeta = recordSortTs(b) >= recordSortTs(a);
  var out = Object.assign({}, preferBMeta ? a : b, preferBMeta ? b : a);
  var aBase = a.creditBaseAt != null ? String(a.creditBaseAt) : "";
  var bBase = b.creditBaseAt != null ? String(b.creditBaseAt) : "";
  var aTs = recordSortTs(a);
  var bTs = recordSortTs(b);

  if (
    aBase &&
    aBase === bBase &&
    a.creditBefore != null &&
    b.creditBefore != null &&
    Math.abs(Number(a.creditBefore) - Number(b.creditBefore)) < 1e-9
  ) {
    var parentCredit = Number(a.creditBefore);
    out.credit = Math.max(0, parentCredit + (Number(a.credit) - Number(a.creditBefore)) + (Number(b.credit) - Number(b.creditBefore)));
    out.creditBefore = parentCredit;
    out.creditBaseAt = aBase;
  } else if (bBase && bBase === String(a.updatedAt || "") && b.credit != null) {
    out.credit = b.credit;
    if (b.creditBefore != null) out.creditBefore = b.creditBefore;
    if (b.creditBaseAt != null) out.creditBaseAt = b.creditBaseAt;
  } else if (aBase && aBase === String(b.updatedAt || "") && a.credit != null) {
    out.credit = a.credit;
    if (a.creditBefore != null) out.creditBefore = a.creditBefore;
    if (a.creditBaseAt != null) out.creditBaseAt = a.creditBaseAt;
  } else if (bTs >= aTs) {
    if (b.credit != null) out.credit = b.credit;
  } else if (a.credit != null) {
    out.credit = a.credit;
  }

  var aSpentBase = a.spentBaseAt != null ? String(a.spentBaseAt) : "";
  var bSpentBase = b.spentBaseAt != null ? String(b.spentBaseAt) : "";
  if (
    aSpentBase &&
    aSpentBase === bSpentBase &&
    a.spentBefore != null &&
    b.spentBefore != null &&
    Math.abs(Number(a.spentBefore) - Number(b.spentBefore)) < 1e-9
  ) {
    var parentSpent = Number(a.spentBefore);
    out.totalSpent = Math.max(0, parentSpent + (Number(a.totalSpent) - Number(a.spentBefore)) + (Number(b.totalSpent) - Number(b.spentBefore)));
    out.spentBefore = parentSpent;
    out.spentBaseAt = aSpentBase;
  } else if (bSpentBase && bSpentBase === String(a.updatedAt || "") && b.totalSpent != null) {
    out.totalSpent = b.totalSpent;
    if (b.spentBefore != null) out.spentBefore = b.spentBefore;
    if (b.spentBaseAt != null) out.spentBaseAt = b.spentBaseAt;
  } else if (aSpentBase && aSpentBase === String(b.updatedAt || "") && a.totalSpent != null) {
    out.totalSpent = a.totalSpent;
    if (a.spentBefore != null) out.spentBefore = a.spentBefore;
    if (a.spentBaseAt != null) out.spentBaseAt = a.spentBaseAt;
  } else if (bTs >= aTs) {
    if (b.totalSpent != null) out.totalSpent = b.totalSpent;
  } else if (a.totalSpent != null) {
    out.totalSpent = a.totalSpent;
  }

  return out;
}

export function mergeRecordArraysByNewest(localArr, remoteArr, storageKey) {
  var byId = {};
  var noId = [];

  function ingest(arr) {
    (arr || []).forEach(function (row) {
      if (!row || typeof row !== "object") return;
      if (row.id == null) {
        noId.push(row);
        return;
      }
      var id = String(row.id);
      var prev = byId[id];
      if (!prev) {
        byId[id] = row;
        return;
      }
      byId[id] = pickNewerRow(prev, row, storageKey);
    });
  }

  ingest(localArr);
  ingest(remoteArr);

  var merged = Object.keys(byId).map(function (k) { return byId[k]; });
  return merged.concat(noId);
}

var RECENT_LOCAL_WRITE_MS = 10000;

function readRestoreGraceUntil() {
  try {
    if (typeof window !== "undefined" && window._idbCache && window._idbCache.tc3_restore_grace_until) {
      return String(window._idbCache.tc3_restore_grace_until);
    }
    if (typeof window !== "undefined" && window.localStorage) {
      var raw = window.localStorage.getItem("tc3_restore_grace_until");
      if (raw) {
        try { return String(JSON.parse(raw)); } catch (_e) { return String(raw); }
      }
    }
  } catch (_e) {}
  return "";
}

function isRestoreGraceActive() {
  var until = readRestoreGraceUntil();
  if (!until) return false;
  try { return new Date(until).getTime() > Date.now(); } catch (_e) { return false; }
}

function isRecentLocalWrite(storageKey) {
  var recent = {};
  try {
    recent = typeof window !== "undefined" ? (window._tcRecentLocalWrites || {}) : {};
  } catch (_e) {}
  var ts = recent[storageKey];
  return !!(ts && Date.now() - ts <= RECENT_LOCAL_WRITE_MS);
}

function isSyncKeyPending(storageKey) {
  try {
    if (typeof window !== "undefined" && window.TC_SYNC && typeof window.TC_SYNC.isKeyPending === "function") {
      return window.TC_SYNC.isKeyPending(storageKey);
    }
  } catch (_e) {}
  return false;
}

/**
 * Pull merge when this PC did not just edit the key: server array defines membership
 * (deletes propagate). Per-id field conflicts still resolve by newest timestamp.
 * Local-only rows are kept only while a push for that key is still pending.
 */
function mergeRecordArraysServerMembership(localArr, remoteArr, storageKey) {
  var localById = {};
  (localArr || []).forEach(function (row) {
    if (row && row.id != null) localById[String(row.id)] = row;
  });

  var remoteIds = {};
  var result = [];
  var noId = [];

  (remoteArr || []).forEach(function (row) {
    if (!row || typeof row !== "object") return;
    if (row.id == null) {
      noId.push(row);
      return;
    }
    var id = String(row.id);
    remoteIds[id] = true;
    var local = localById[id];
    if (!local) {
      result.push(row);
      return;
    }
    result.push(pickNewerRow(local, row, storageKey));
  });

  var keepLocalOnly = isRecentLocalWrite(storageKey) || isSyncKeyPending(storageKey);
  if (keepLocalOnly) {
    (localArr || []).forEach(function (row) {
      if (!row || row.id == null) return;
      var id = String(row.id);
      if (!remoteIds[id]) result.push(row);
    });
  }

  return result.concat(noId);
}

/** During backup restore, local arrays replace server membership until grace expires. */
function mergeRecordArraysLocalMembership(localArr, remoteArr, storageKey) {
  var remoteById = {};
  (remoteArr || []).forEach(function (row) {
    if (row && row.id != null) remoteById[String(row.id)] = row;
  });

  var result = [];
  var noId = [];
  (localArr || []).forEach(function (row) {
    if (!row || typeof row !== "object") return;
    if (row.id == null) {
      noId.push(row);
      return;
    }
    var id = String(row.id);
    var remote = remoteById[id];
    if (!remote) {
      result.push(row);
      return;
    }
    result.push(pickNewerRow(row, remote, storageKey));
  });

  return result.concat(noId);
}

function mergeRecordArraysForPull(localArr, remoteArr, storageKey) {
  /* Ledger / inventory layer rows are append-only with unique ids — never let a partial server
     snapshot drop local-only lines (causes GL imbalance e.g. missing AR debit on a sale). */
  if (
    storageKey === "tc3_journal_lines" ||
    storageKey === "tc3_inventory_layers" ||
    storageKey === "tc3_stock_movements" ||
    storageKey === "tc3_financial_snapshots"
  ) {
    return mergeRecordArraysByNewest(localArr, remoteArr, storageKey);
  }
  if (isRestoreGraceActive()) {
    return mergeRecordArraysLocalMembership(localArr, remoteArr, storageKey);
  }
  if (isRecentLocalWrite(storageKey)) {
    var merged = mergeRecordArraysByNewest(localArr, remoteArr, storageKey);
    return applyRecentLocalMembership(localArr, merged, storageKey);
  }
  return mergeRecordArraysServerMembership(localArr, remoteArr, storageKey);
}

/** If local was recently edited, drop server-only ids (prevents deleted rows reappearing on pull). */
function applyRecentLocalMembership(localArr, mergedArr, storageKey) {
  var recent = {};
  try {
    recent = typeof window !== "undefined" ? (window._tcRecentLocalWrites || {}) : {};
  } catch (_e) {}
  var ts = recent[storageKey];
  if (!ts || Date.now() - ts > RECENT_LOCAL_WRITE_MS) return mergedArr;
  if (!Array.isArray(localArr) || !Array.isArray(mergedArr)) return mergedArr;

  var localIds = {};
  localArr.forEach(function (row) {
    if (row && row.id != null) localIds[String(row.id)] = true;
  });
  return mergedArr.filter(function (row) {
    if (!row || row.id == null) return true;
    return !!localIds[String(row.id)];
  });
}

export function mergeSettingsFromServer(local, remote) {
  if (!remote || typeof remote !== "object" || Array.isArray(remote)) {
    return local || remote;
  }
  if (!local || typeof local !== "object" || Array.isArray(local)) return remote;
  var out = Object.assign({}, local, remote);
  var guardedKeys = [
    "shopName", "phone", "phone2", "whatsapp", "address",
    "email", "website", "brn", "footer",
  ];
  function isBlank(v) {
    return v == null || (typeof v === "string" && v.trim() === "");
  }
  var netRole = "";
  try {
    netRole = typeof window !== "undefined" ? String(window._tcNetRole || "") : "";
  } catch (_e) {}
  guardedKeys.forEach(function (k) {
    if (netRole === "network_server" && !isBlank(local[k])) out[k] = local[k];
    else if (isBlank(remote[k]) && !isBlank(local[k])) out[k] = local[k];
  });
  if (netRole === "network_client") {
    out.mainModuleToggles = Object.assign({}, local.mainModuleToggles || local.moduleToggles || {}, remote.mainModuleToggles || remote.moduleToggles || {});
    out.staffModuleToggles = Object.assign({}, remote.staffModuleToggles || {}, local.staffModuleToggles || {});
    out.counterModuleToggles = Object.assign({}, remote.counterModuleToggles || {}, local.counterModuleToggles || {});
    out.moduleToggles = out.mainModuleToggles;
    out.enabledCategoryGroups = Object.assign({}, remote.enabledCategoryGroups || {}, local.enabledCategoryGroups || {});
    if (remote.mainAdminPassHash) out.mainAdminPassHash = remote.mainAdminPassHash;
  } else {
    out.mainModuleToggles = Object.assign({}, remote.mainModuleToggles || remote.moduleToggles || {}, local.mainModuleToggles || local.moduleToggles || {});
    out.staffModuleToggles = Object.assign({}, remote.staffModuleToggles || {}, local.staffModuleToggles || {});
    out.counterModuleToggles = Object.assign({}, remote.counterModuleToggles || {}, local.counterModuleToggles || {});
    out.moduleToggles = out.mainModuleToggles;
    out.enabledCategoryGroups = Object.assign({}, local.enabledCategoryGroups || {}, remote.enabledCategoryGroups || {});
    if (remote.mainAdminPassHash && !local.mainAdminPassHash) out.mainAdminPassHash = remote.mainAdminPassHash;
    else if (local.mainAdminPassHash) out.mainAdminPassHash = local.mainAdminPassHash;
  }
  return out;
}

export function mergeServerStateWithLocal(localCache, serverData) {
  if (!serverData || typeof serverData !== "object") {
    return localCache && typeof localCache === "object" ? localCache : serverData;
  }
  localCache = localCache || {};
  var out = Object.assign({}, serverData);
  var keySet = {};
  Object.keys(serverData).forEach(function (k) { keySet[k] = true; });
  Object.keys(localCache).forEach(function (k) {
    if (typeof k === "string" && k.indexOf("tc3_") === 0) keySet[k] = true;
  });
  Object.keys(keySet).forEach(function (key) {
    if (key === "tc3_settings") {
      out[key] = mergeSettingsFromServer(localCache[key], serverData[key]);
      return;
    }
    if (!MERGEABLE_RECORD_ARRAY_KEYS[key]) {
      if (out[key] === undefined && localCache[key] !== undefined) out[key] = localCache[key];
      return;
    }
    var remoteArr = Array.isArray(serverData[key]) ? serverData[key] : [];
    var localArr = Array.isArray(localCache[key]) ? localCache[key] : [];
    out[key] = mergeRecordArraysForPull(localArr, remoteArr, key);
  });
  return reconcileMergedVoidReturnState(out, localCache, serverData);
}
