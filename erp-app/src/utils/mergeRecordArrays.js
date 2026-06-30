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

export function mergeServerStateWithLocal(localCache, serverData) {
  if (!serverData || typeof serverData !== "object") return serverData;
  var out = Object.assign({}, serverData);
  Object.keys(serverData).forEach(function (key) {
    if (!MERGEABLE_RECORD_ARRAY_KEYS[key]) return;
    var remote = serverData[key];
    var local = localCache[key];
    if (!Array.isArray(remote) || !Array.isArray(local)) return;
    out[key] = mergeRecordArraysByNewest(local, remote);
  });
  return out;
}
