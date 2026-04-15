/**
 * Escalates GL audit events that indicate invariant or sync merge failures (validation-only).
 */

var CRITICAL_AUDIT_ACTIONS = {
  journal_commit_invariant_fail: true,
  journal_merge_imbalance: true,
  journal_validation_failed: true,
  journal_post_merge_imbalance: true,
  journal_sync_merge_imbalance: true,
  journal_sync_merge_commit_failed: true,
};

/**
 * @param {string} action
 * @param {object} detail
 * @param {object} S
 * @param {function} coreSet — _coreStorageSet
 * @param {boolean} [blockWrites] — when true, subsequent GL commits are rejected until cleared
 */
export function handleOperationalGuardAudit(action, detail, S, coreSet, blockWrites) {
  if (!CRITICAL_AUDIT_ACTIONS[action]) return;
  var row = {
    ts: new Date().toISOString(),
    action: action,
    detail: detail && typeof detail === "object" ? detail : { message: String(detail || "") },
  };
  try {
    if (typeof window !== "undefined" && window.electronAPI && window.electronAPI.writeLog) {
      window.electronAPI.writeLog({
        level: "error",
        message: "[TechonERP CRITICAL] " + action + " " + JSON.stringify(row.detail).slice(0, 3500),
      });
    }
  } catch (e) { /* ignore */ }
  try {
    coreSet("tc3_operational_critical", row);
  } catch (e2) { /* ignore */ }
  if (blockWrites) {
    try {
      coreSet("tc3_operational_guard", {
        blockWrites: true,
        since: row.ts,
        reason: action,
      });
    } catch (e3) { /* ignore */ }
  }
}

export function clearOperationalWriteGuard(S, coreSet) {
  try {
    coreSet("tc3_operational_guard", null);
  } catch (e) { /* ignore */ }
}
