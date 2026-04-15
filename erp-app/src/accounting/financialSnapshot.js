/**
 * Period-close style financial snapshots for audit and faster reference.
 * Snapshots are sealed with legacy content hash + HMAC-SHA256 for tamper detection.
 */

import { trialBalance, balanceSheetFromLedger } from "./generalLedger.js";
import { isSnapshotDeviceHmacAllowed } from "../productionConfig.js";
import { isProductionLicenseSecretMissingBlock } from "../ops/accountingGuards.js";
import {
  computeSnapshotHmacHex,
  computeSnapshotHmacHexV2,
  resolveSnapshotSecretForRenderer,
  verifySnapshotHmacFlexible,
} from "./snapshotIntegrityHmac.js";

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map(function (x) { return stableStringify(x); }).join(",") + "]";
  }
  var keys = Object.keys(obj).sort();
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === "contentHash" || k === "integritySealed" || k === "integrityHmac" || k === "tampered" || k === "algorithm") continue;
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
    return !!snapshot.id;
  }
  var expected = snapshot.contentHash;
  if (typeof expected !== "string") return false;
  var clone = JSON.parse(JSON.stringify(snapshot));
  delete clone.contentHash;
  delete clone.integritySealed;
  delete clone.integrityHmac;
  delete clone.tampered;
  delete clone.algorithm;
  return hashSnapshotContent(clone) === expected;
}

/**
 * Full check including HMAC (async).
 */
export async function validateSnapshotIntegrityFull(snapshot) {
  if (!validateSnapshotIntegrity(snapshot)) {
    return { ok: false, tampered: true, reason: "legacy_hash_mismatch" };
  }
  if (!snapshot.integrityHmac || typeof snapshot.integrityHmac !== "string") {
    return { ok: true, tampered: false, legacy: true, reason: "legacy_only" };
  }
  var clone = JSON.parse(JSON.stringify(snapshot));
  delete clone.contentHash;
  delete clone.integritySealed;
  delete clone.integrityHmac;
  delete clone.tampered;
  delete clone.algorithm;
  var canon = stableStringify(clone);
  var flex = await verifySnapshotHmacFlexible(snapshot, canon);
  if (!flex.ok) {
    return { ok: true, tampered: true, reason: flex.reason || "hmac_mismatch" };
  }
  return { ok: true, tampered: false, reason: "hmac_ok", matched: flex.matched };
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
 * Append a snapshot with legacy hash + HMAC seal.
 */
export async function appendSnapshot(S, snapshot, opts) {
  opts = opts || {};
  var prevEarly = S.get("tc3_financial_snapshots", []);
  if (!Array.isArray(prevEarly)) prevEarly = [];
  if (isProductionLicenseSecretMissingBlock()) {
    try {
      if (typeof console !== "undefined" && console.error) {
        console.error("[TechonERP] Financial snapshot blocked: LICENSE_SECRET not configured.");
      }
    } catch (e0) { /* ignore */ }
    return prevEarly;
  }
  var raw = JSON.parse(JSON.stringify(snapshot || {}));
  delete raw.contentHash;
  delete raw.integritySealed;
  delete raw.integrityHmac;
  delete raw.tampered;
  delete raw.algorithm;
  raw.contentHash = hashSnapshotContent(raw);
  var canon = stableStringify(raw);
  var licSecret = await resolveSnapshotSecretForRenderer();
  if (licSecret) {
    raw.integrityHmac = await computeSnapshotHmacHexV2(canon, licSecret);
    raw.algorithm = "hmac-sha256-v2";
    raw.integritySealed = true;
  } else if (isSnapshotDeviceHmacAllowed()) {
    raw.integrityHmac = await computeSnapshotHmacHex(canon);
    raw.algorithm = "hmac-sha256-v1";
    raw.integritySealed = true;
  } else {
    raw.integrityHmac = "";
    raw.algorithm = "hmac-sha256-v2-required";
    raw.integritySealed = false;
    try {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[TechonERP] Financial snapshot: LICENSE_SECRET not set — snapshot not cryptographically sealed (production build).");
      }
    } catch (e) { /* ignore */ }
  }
  var body = raw;
  var prev = S.get("tc3_financial_snapshots", []);
  if (!Array.isArray(prev)) prev = [];
  var next = prev.concat([body]).slice(-120);
  S.set("tc3_financial_snapshots", next);
  if (typeof opts.addAudit === "function") {
    try {
      opts.addAudit("Financial snapshot created", body.id || "", { contentHash: body.contentHash, algorithm: body.algorithm || "", integrityHmac: !!(body.integrityHmac && body.integrityHmac.length), label: body.label || "" });
    } catch (e) { /* ignore */ }
  }
  return next;
}

/** Sync sanitize: legacy hash only; drops clearly invalid. */
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

/** Async: verify HMAC; mark tampered in-place, log warnings. */
export async function verifyFinancialSnapshotsHmac(S, opts) {
  opts = opts || {};
  var prev = S.get("tc3_financial_snapshots", []);
  if (!Array.isArray(prev) || !prev.length) return { checked: 0, tampered: 0 };
  var changed = false;
  var tampered = 0;
  var i;
  for (i = 0; i < prev.length; i++) {
    var s = prev[i];
    if (!s || !s.integrityHmac) continue;
    var vr = await validateSnapshotIntegrityFull(s);
    if (vr.tampered || vr.ok === false) {
      s.tampered = true;
      s.integrityWarning = vr.reason || "tampered";
      tampered++;
      changed = true;
      try {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[TechonERP] Snapshot integrity:", s.id, vr.reason);
        }
      } catch (e) { /* ignore */ }
    } else {
      if (s.tampered) {
        delete s.tampered;
        delete s.integrityWarning;
        changed = true;
      }
    }
  }
  if (changed) {
    S.set("tc3_financial_snapshots", prev);
    if (typeof opts.addAudit === "function" && tampered) {
      try {
        opts.addAudit("Financial snapshot HMAC", tampered + " snapshot(s) marked tampered", {});
      } catch (e) { /* ignore */ }
    }
  }
  return { checked: prev.length, tampered: tampered };
}
