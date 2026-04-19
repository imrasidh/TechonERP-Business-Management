/**
 * One-click JSON package for remote support (additive — optional anonymization).
 */

import { reconcileInventoryToLedger, deriveInventoryEconomics } from "../accounting/inventoryEngine.js";
import { buildInventoryReplayWindow } from "./inventoryReplayDebug.js";

function anonymizeCustomers(obj) {
  try {
    var copy = JSON.parse(JSON.stringify(obj || {}));
  } catch (e) {
    return {};
  }
  var scrubArr = function (arr, fn) {
    if (!Array.isArray(arr)) return;
    arr.forEach(fn);
  };
  scrubArr(copy.tc3_customers, function (c) {
    if (!c || typeof c !== "object") return;
    if (c.name) c.name = "[CUSTOMER]";
    if (c.phone) c.phone = "";
    if (c.phone2) c.phone2 = "";
    if (c.email) c.email = "";
    if (c.address) c.address = "";
  });
  scrubArr(copy.tc3_sales, function (s) {
    if (!s || typeof s !== "object") return;
    if (s.customerName) s.customerName = "[CUSTOMER]";
    if (s.customerPhone) s.customerPhone = "";
  });
  scrubArr(copy.tc3_salesReturns, function (r) {
    if (!r || typeof r !== "object") return;
    if (r.customerName) r.customerName = "[CUSTOMER]";
  });
  return copy;
}

/**
 * @param opts {{ periodFrom?: string, periodTo?: string, includeReplay?: boolean, replayProductId?: string, anonymize?: boolean }}
 */
export function buildSupportBundle(state, S, chart, opts) {
  opts = opts || {};
  var lines = S.get("tc3_journal_lines", []);
  var invDer = deriveInventoryEconomics(state, S);
  var reconciliation = reconcileInventoryToLedger(lines, invDer, chart);

  var bundle = {
    exportedAt: new Date().toISOString(),
    techonSupportBundle: true,
    version: 1,
    periodFrom: opts.periodFrom || "",
    periodTo: opts.periodTo || "",
    settingsSummary: {
      shopName: state.settings && state.settings.shopName,
      inventoryCostingMethod: state.settings && state.settings.inventoryCostingMethod,
      purchaseReturnCostMode: state.settings && state.settings.purchaseReturnCostMode,
      lockedUntilDate: state.settings && state.settings.lockedUntilDate,
    },
    reconciliationSummary: reconciliation,
    snapshotMeta: (function () {
      var snaps = S.get("tc3_financial_snapshots", []);
      var last = Array.isArray(snaps) && snaps.length ? snaps[snaps.length - 1] : null;
      if (!last) return null;
      return {
        id: last.id,
        createdAt: last.createdAt,
        label: last.label,
        contentHashPrefix: typeof last.contentHash === "string" ? last.contentHash.slice(0, 24) : "",
        trialBalanceHasAccounts: !!(last.trialBalanceAccounts && typeof last.trialBalanceAccounts === "object"),
      };
    })(),
    journalMeta: {
      lineCount: (lines || []).length,
      hashPresent: !!S.get("tc3_journal_hash", ""),
    },
    replaySample: null,
    dataSubset: null,
  };

  if (opts.includeReplay && opts.replayProductId) {
    try {
      var from = opts.periodFrom || new Date().toISOString().slice(0, 10);
      var to = opts.periodTo || new Date().toISOString().slice(0, 10);
      var w = buildInventoryReplayWindow(invDer, opts.replayProductId, from, to, { maxRows: 2000 });
      bundle.replaySample = {
        productId: opts.replayProductId,
        from: from,
        to: to,
        rowCount: (w.rows || []).length,
        movements: (w.rows || []).slice(0, 800),
      };
    } catch (e) {
      bundle.replaySample = { error: String(e && e.message ? e.message : e) };
    }
  }

  var subsetKeys = ["tc3_settings", "tc3_journal_lines", "tc3_gl_accounts", "tc3_inventory_layers", "tc3_financial_snapshots"];
  bundle.dataSubset = {};
  subsetKeys.forEach(function (k) {
    bundle.dataSubset[k] = S.get(k, null);
  });

  if (opts.anonymize) {
    bundle.dataSubset = anonymizeCustomers(bundle.dataSubset);
  }

  return bundle;
}

export function downloadSupportBundleJson(bundle, filename) {
  var blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "techon-support-bundle.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
