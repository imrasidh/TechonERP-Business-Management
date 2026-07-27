/**
 * Internal operational monitoring — read-only; does not change business logic.
 */

import { isInventoryReconcileOk } from "../accounting/inventoryEngine.js";
import { diagnoseGlStorage } from "./glStorageHealth.js";

function countAuditActions(audit, actions) {
  var map = {};
  var i;
  for (i = 0; i < actions.length; i++) map[actions[i]] = 0;
  var j;
  for (j = 0; j < (audit || []).length; j++) {
    var a = audit[j] && audit[j].action;
    if (a && map[a] !== undefined) map[a]++;
  }
  return map;
}

/**
 * @param {object} S — storage get/set (same as App S)
 * @param {object} [syncMeta] — optional { lastError?: string, lastOkAt?: string }
 * @returns {object}
 */
export function buildOperationalHealthSnapshot(S, syncMeta) {
  var audit = S.get("tc3_gl_audit", []) || [];
  var tail = audit.slice(-300);
  var inv = S.get("tc3_inv_reconciliation", null);
  var settings = S.get("tc3_settings", {}) || {};
  var lastInvOk = inv && isInventoryReconcileOk(inv, settings);
  var failActions = [
    "journal_merge_imbalance",
    "journal_commit_invariant_fail",
    "journal_validation_failed",
    "journal_post_merge_imbalance",
    "journal_commit_storage_failed",
    "journal_sync_merge_imbalance",
    "journal_sync_merge_commit_failed",
  ];
  var counts = countAuditActions(tail, failActions.concat(["journal_commit", "journal_sync_merged"]));
  var failSum = 0;
  var fi;
  for (fi = 0; fi < failActions.length; fi++) {
    failSum += counts[failActions[fi]] || 0;
  }
  var syncFail = (counts["journal_sync_merge_imbalance"] || 0) + (counts["journal_sync_merge_commit_failed"] || 0);
  var commitFail = (counts["journal_commit_storage_failed"] || 0) + (counts["journal_commit_invariant_fail"] || 0);

  var glStorage = diagnoseGlStorage(S);
  var lastAuto = S.get("tc3_last_auto_backup", null) || S.get("tc3_last_manual_backup", null);
  var backupAgeHours = null;
  if (lastAuto) {
    backupAgeHours = Math.max(0, (Date.now() - new Date(lastAuto).getTime()) / 3600000);
  }

  return {
    ok: failSum === 0 && !(syncMeta && syncMeta.lastError) && glStorage.ok && (backupAgeHours == null || backupAgeHours <= 72),
    generatedAt: new Date().toISOString(),
    glStorage: glStorage,
    backup: {
      lastAt: lastAuto || null,
      ageHours: backupAgeHours != null ? Math.round(backupAgeHours * 10) / 10 : null,
      stale: backupAgeHours != null && backupAgeHours > 48,
    },
    sync: syncMeta
      ? {
          lastError: syncMeta.lastError || null,
          lastOkAt: syncMeta.lastOkAt || null,
          status: syncMeta.status || null,
        }
      : null,
    glAuditWindow: 300,
    glCommitFailures: failSum,
    syncRelatedFailures: syncFail,
    commitRelatedFailures: commitFail,
    glFailureBreakdown: countAuditActions(tail, failActions),
    inventoryReconciliationOk: lastInvOk,
    reconciliationSummary: inv ? { ok: isInventoryReconcileOk(inv, settings) } : null,
  };
}
