/**
 * Merge ERP record arrays by id — newest updatedAt/createdAt wins (multi-terminal sync).
 */

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
};

function recordSortTs(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.updatedAt || row.createdAt || row.billedAt || row.date || "");
}

export function mergeRecordArraysByNewest(localArr, remoteArr) {
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
      var pts = recordSortTs(prev);
      var rts = recordSortTs(row);
      byId[id] = rts >= pts ? row : prev;
    });
  }

  ingest(localArr);
  ingest(remoteArr);

  var merged = Object.keys(byId).map(function (k) { return byId[k]; });
  return merged.concat(noId);
}

var RECENT_LOCAL_WRITE_MS = 10000;

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
    var pts = recordSortTs(local);
    var rts = recordSortTs(row);
    result.push(rts >= pts ? row : local);
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

function mergeRecordArraysForPull(localArr, remoteArr, storageKey) {
  if (isRecentLocalWrite(storageKey)) {
    var merged = mergeRecordArraysByNewest(localArr, remoteArr);
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
    out.counterModuleToggles = Object.assign({}, remote.counterModuleToggles || {}, local.counterModuleToggles || {});
    out.moduleToggles = out.mainModuleToggles;
    out.enabledCategoryGroups = Object.assign({}, remote.enabledCategoryGroups || {}, local.enabledCategoryGroups || {});
    if (remote.mainAdminPassHash) out.mainAdminPassHash = remote.mainAdminPassHash;
  } else {
    out.mainModuleToggles = Object.assign({}, remote.mainModuleToggles || remote.moduleToggles || {}, local.mainModuleToggles || local.moduleToggles || {});
    out.counterModuleToggles = Object.assign({}, remote.counterModuleToggles || {}, local.counterModuleToggles || {});
    out.moduleToggles = out.mainModuleToggles;
    out.enabledCategoryGroups = Object.assign({}, local.enabledCategoryGroups || {}, remote.enabledCategoryGroups || {});
    if (remote.mainAdminPassHash && !local.mainAdminPassHash) out.mainAdminPassHash = remote.mainAdminPassHash;
    else if (local.mainAdminPassHash) out.mainAdminPassHash = local.mainAdminPassHash;
  }
  return out;
}

export function mergeServerStateWithLocal(localCache, serverData) {
  if (!serverData || typeof serverData !== "object") return serverData;
  var out = Object.assign({}, serverData);
  Object.keys(serverData).forEach(function (key) {
    if (key === "tc3_settings") {
      out[key] = mergeSettingsFromServer(localCache[key], serverData[key]);
      return;
    }
    if (!MERGEABLE_RECORD_ARRAY_KEYS[key]) return;
    var remote = serverData[key];
    var local = localCache[key];
    if (!Array.isArray(remote) || !Array.isArray(local)) return;
    out[key] = mergeRecordArraysForPull(local, remote, key);
  });
  return out;
}
