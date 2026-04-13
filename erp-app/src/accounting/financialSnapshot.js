/**
 * Period-close style financial snapshots for audit and faster reference.
 * Snapshots are sealed with a content hash; tampered entries are dropped on validation.
 */

import { trialBalance, balanceSheetFromLedger } from "./generalLedger.js";

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(function (x) { return stableStringify(x); }).join(",") + "]";
  }
  var keys = Object.keys(obj).sort();
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === "contentHash" || k === "integritySealed") continue;
    parts.push(JSON.stringify(k) + ":" + stableStringify(obj[k]));
  }
  return "{" + parts.join(",") + "}";
}

/** Deterministic hash for snapshot body (excludes seal fields). */
export function hashSnapshotContent(snapshot) {
  try {
    var s = stableStringify(snapshot || {});
    var h = 5381;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) + h) + s.charCodeAt(i);
      h = h | 0;
    }
    return "snap_" + (h >>> 0).toString(16);
  } catch (e) {
    return "";
  }
}

export function validateSnapshotIntegrity(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (!snapshot.contentHash) {
    /* Legacy snapshots (before sealing) — keep if minimally well-formed */
    return !!snapshot.id;
  }
  var expected = snapshot.contentHash;
  if (typeof expected !== "string") return false;
  var clone = JSON.parse(JSON.stringify(snapshot));
  delete clone.contentHash;
  delete clone.integritySealed;
  return hashSnapshotContent(clone) === expected;
}

export function buildFinancialSnapshot(S, lines, chart, invDer, opts) {
  opts = opts || {};
  var tb = trialBalance(lines, chart);
  var bs = balanceSheetFromLedger(lines, chart, opts.asOfDate || null);
  var settings = S.get("tc3_settings", {}) || {};
  return {
    id: opts.id || "snap_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
    createdAt: new Date().toISOString(),
    label: opts.label || "",
    periodCloseDate: opts.periodCloseDate || settings.booksClosedDate || settings.lockedUntilDate || "",
    asOfDate: opts.asOfDate || null,
    trialBalance: { totalDebit: tb.totalDebit, totalCredit: tb.totalCredit, balanced: tb.balanced, rowCount: (tb.rows || []).length },
    balanceSheet: {
      assets: bs.assets,
      liabilities: bs.liabilities,
      equity: bs.equity,
      balanced: bs.balanced,
      difference: bs.difference,
    },
    inventoryValue: invDer && invDer.physicalInventoryValue != null ? invDer.physicalInventoryValue : null,
    inventoryOk: invDer && invDer.reconciliation ? invDer.reconciliation.ok : null,
  };
}

/**
 * Append a snapshot with hash seal. Pass opts.addAudit(action, ref, detail) to log creation.
 */
export function appendSnapshot(S, snapshot, opts) {
  opts = opts || {};
  var body = JSON.parse(JSON.stringify(snapshot || {}));
  delete body.contentHash;
  delete body.integritySealed;
  body.contentHash = hashSnapshotContent(body);
  body.integritySealed = true;
  var prev = S.get("tc3_financial_snapshots", []);
  if (!Array.isArray(prev)) prev = [];
  var next = prev.concat([body]).slice(-120);
  S.set("tc3_financial_snapshots", next);
  if (typeof opts.addAudit === "function") {
    try {
      opts.addAudit("Financial snapshot created", body.id || "", { contentHash: body.contentHash, label: body.label || "" });
    } catch (e) { /* ignore */ }
  }
  return next;
}

/** Remove invalid / tampered snapshots; optional addAudit for drops. */
export function sanitizeFinancialSnapshots(S, opts) {
  opts = opts || {};
  var prev = S.get("tc3_financial_snapshots", []);
  if (!Array.isArray(prev) || !prev.length) return { kept: 0, dropped: 0 };
  var good = [];
  var droppedIds = [];
  prev.forEach(function (s) {
    if (validateSnapshotIntegrity(s)) good.push(s);
    else if (s && s.id) droppedIds.push(s.id);
  });
  if (droppedIds.length) {
    S.set("tc3_financial_snapshots", good);
    if (typeof opts.addAudit === "function") {
      try {
        opts.addAudit("Financial snapshot integrity", droppedIds.length + " invalid sealed snapshot(s) removed", { droppedIds: droppedIds });
      } catch (e) { /* ignore */ }
    }
  }
  return { kept: good.length, dropped: droppedIds.length };
}
