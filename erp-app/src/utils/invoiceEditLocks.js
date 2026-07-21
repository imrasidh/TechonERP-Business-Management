/**
 * Soft edit-locks for sale invoices (multi-PC).
 * Stored as a mergeable record array so concurrent locks on different invoices
 * survive last-write sync races better than a single object map.
 */
import { getOrCreateDeviceId } from "../accounting/ids.js";
import { mergeRecordArraysByNewest } from "./mergeRecordArrays.js";
import {
  loadStateFromServer,
  setSyncHydrating,
  syncStorageKeyNow,
} from "../sync/SyncEngine.js";

export var INVOICE_EDIT_LOCKS_KEY = "tc3_invoice_edit_locks";
export var INVOICE_EDIT_LOCK_TTL_MS = 8 * 60 * 1000; /* 8 minutes — tighter advisory window */
export var INVOICE_EDIT_LOCK_HEARTBEAT_MS = 2 * 60 * 1000; /* renew while modal open */
export var INVOICE_EDIT_LOCK_OWNERSHIP_MS = 2000; /* re-check peer ownership while editing */
export var INVOICE_EDIT_LOCK_PRUNE_GRACE_MS = 15 * 60 * 1000; /* drop stale released/expired rows */

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

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

function applyLocksToLocalCache(locks) {
  try {
    if (typeof window !== "undefined" && window._idbCache) {
      window._idbCache[INVOICE_EDIT_LOCKS_KEY] = locks;
    }
  } catch (_e) { /* ignore */ }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(INVOICE_EDIT_LOCKS_KEY, JSON.stringify(locks));
    }
  } catch (_e2) { /* ignore */ }
}

export function buildInvoiceEditLockIdentity(opts) {
  opts = opts || {};
  var deviceId = String(opts.deviceId || getOrCreateDeviceId() || "").trim() || "unknown";
  var user = opts.currentUser || null;
  var byUser = "";
  if (user) {
    byUser = String(user.name || user.username || user.displayName || user.role || "").trim();
  }
  if (!byUser) byUser = "User";
  var clientLabel = String(opts.clientMachineLabel || opts.stationLabel || "").trim();
  var by = clientLabel ? (clientLabel + " · " + byUser) : byUser;
  return { deviceId: deviceId, by: by, byUser: byUser, clientLabel: clientLabel };
}

function isLockActive(row, atMs) {
  if (!row || row.active === false) return false;
  var exp = row.expiresAt ? Date.parse(String(row.expiresAt)) : NaN;
  if (!isNaN(exp) && exp <= atMs) return false;
  return true;
}

export function readInvoiceEditLocks(S) {
  if (!S || typeof S.get !== "function") return [];
  return asArray(S.get(INVOICE_EDIT_LOCKS_KEY, []));
}

export function findActiveInvoiceEditLock(locks, saleId, atMs) {
  if (saleId == null || saleId === "") return null;
  var id = String(saleId);
  var t = atMs == null ? nowMs() : atMs;
  var best = null;
  (locks || []).forEach(function (row) {
    if (!row || String(row.id) !== id) return;
    if (!isLockActive(row, t)) return;
    if (!best) {
      best = row;
      return;
    }
    var bts = String(best.updatedAt || best.at || "");
    var rts = String(row.updatedAt || row.at || "");
    if (rts >= bts) best = row;
  });
  return best;
}

export function formatInvoiceEditLockMessage(lock) {
  if (!lock) return "This document is being edited on another counter.";
  var who = String(lock.by || lock.byUser || lock.clientLabel || "another counter").trim() || "another counter";
  return "Being edited by " + who + ". View only until they save or cancel (or the lock expires).";
}

/** Drop long-expired / released lock rows so the shared array stays small. */
export function pruneExpiredInvoiceEditLocks(locks, atMs) {
  var t = atMs == null ? nowMs() : atMs;
  var cutoff = t - INVOICE_EDIT_LOCK_PRUNE_GRACE_MS;
  return asArray(locks).filter(function (row) {
    if (!row || row.id == null) return false;
    var exp = row.expiresAt ? Date.parse(String(row.expiresAt)) : NaN;
    if (row.active === false) {
      return isNaN(exp) || exp > cutoff;
    }
    /* Keep live locks; drop ones expired well past grace (peers already treat as inactive). */
    if (!isNaN(exp) && exp <= cutoff) return false;
    return true;
  });
}

function writeLocks(S, locks) {
  var pruned = pruneExpiredInvoiceEditLocks(locks);
  if (!S || typeof S.set !== "function") {
    applyLocksToLocalCache(pruned);
    return;
  }
  S.set(INVOICE_EDIT_LOCKS_KEY, pruned);
}

function upsertLockRow(locks, nextRow) {
  var id = String(nextRow.id);
  var out = [];
  var replaced = false;
  (locks || []).forEach(function (row) {
    if (!row || row.id == null) return;
    if (String(row.id) === id) {
      out.push(nextRow);
      replaced = true;
    } else {
      out.push(row);
    }
  });
  if (!replaced) out.push(nextRow);
  return out;
}

/**
 * Pull locks from MySQL and merge into local cache (no outbound re-push while hydrating).
 */
export async function refreshInvoiceEditLocksFromServer(S) {
  var cfg = getNetworkAuthConfig();
  if (!cfg) return readInvoiceEditLocks(S);
  try {
    var data = await loadStateFromServer(cfg.apiUrl, [INVOICE_EDIT_LOCKS_KEY], { authConfig: cfg });
    var remote = data && data[INVOICE_EDIT_LOCKS_KEY];
    if (!Array.isArray(remote)) return readInvoiceEditLocks(S);
    var local = readInvoiceEditLocks(S);
    var merged = pruneExpiredInvoiceEditLocks(mergeRecordArraysByNewest(local, remote));
    setSyncHydrating(true);
    try {
      applyLocksToLocalCache(merged);
    } finally {
      setSyncHydrating(false);
    }
    return merged;
  } catch (_e) {
    return readInvoiceEditLocks(S);
  }
}

/**
 * Acquire or renew a soft lock for this device (local only).
 * Prefer acquireInvoiceEditLockSynced on network counters.
 */
export function tryAcquireInvoiceEditLock(S, saleId, identity, opts) {
  opts = opts || {};
  if (saleId == null || saleId === "") {
    return { ok: false, message: "Missing invoice id." };
  }
  identity = identity || buildInvoiceEditLockIdentity();
  var ttl = opts.ttlMs != null ? opts.ttlMs : INVOICE_EDIT_LOCK_TTL_MS;
  var t = nowMs();
  var locks = readInvoiceEditLocks(S);
  var existing = findActiveInvoiceEditLock(locks, saleId, t);
  if (existing && String(existing.deviceId || "") !== String(identity.deviceId || "")) {
    return {
      ok: false,
      conflict: existing,
      message: formatInvoiceEditLockMessage(existing),
    };
  }
  var at = nowIso();
  var next = {
    id: String(saleId),
    active: true,
    deviceId: identity.deviceId,
    by: identity.by,
    byUser: identity.byUser,
    clientLabel: identity.clientLabel || "",
    at: existing && existing.at ? existing.at : at,
    updatedAt: at,
    expiresAt: new Date(t + ttl).toISOString(),
  };
  writeLocks(S, upsertLockRow(locks, next));
  return { ok: true, lock: next };
}

/**
 * Network-safe acquire: refresh → lock → push now → refresh → verify ownership.
 */
export async function acquireInvoiceEditLockSynced(S, saleId, identity, opts) {
  identity = identity || buildInvoiceEditLockIdentity();
  await refreshInvoiceEditLocksFromServer(S);
  var first = tryAcquireInvoiceEditLock(S, saleId, identity, opts);
  if (!first.ok) return first;

  var cfg = getNetworkAuthConfig();
  if (!cfg) return first;

  try {
    var pushVal = readInvoiceEditLocks(S);
    await syncStorageKeyNow(INVOICE_EDIT_LOCKS_KEY, pushVal);
  } catch (_e) { /* continue to verify */ }

  /* Prefer server truth for this sale — clear recent-write grace so foreign lock can win. */
  try {
    if (typeof window !== "undefined" && window._tcRecentLocalWrites) {
      delete window._tcRecentLocalWrites[INVOICE_EDIT_LOCKS_KEY];
    }
  } catch (_e2) { /* ignore */ }

  await refreshInvoiceEditLocksFromServer(S);
  var active = findActiveInvoiceEditLock(readInvoiceEditLocks(S), saleId);
  if (!active) {
    return {
      ok: false,
      message: "Could not confirm edit lock with the server. Try again.",
    };
  }
  if (String(active.deviceId || "") !== String(identity.deviceId || "")) {
    return {
      ok: false,
      conflict: active,
      message: formatInvoiceEditLockMessage(active),
    };
  }
  return { ok: true, lock: active };
}

/** Release only if this device owns the lock (or force). */
export function releaseInvoiceEditLock(S, saleId, identity, opts) {
  opts = opts || {};
  if (saleId == null || saleId === "") return false;
  identity = identity || buildInvoiceEditLockIdentity();
  var t = nowMs();
  var locks = readInvoiceEditLocks(S);
  var id = String(saleId);
  var changed = false;
  var nextLocks = (locks || []).map(function (row) {
    if (!row || String(row.id) !== id) return row;
    if (!opts.force && String(row.deviceId || "") !== String(identity.deviceId || "")) return row;
    if (row.active === false && !isLockActive(row, t)) return row;
    changed = true;
    return Object.assign({}, row, {
      active: false,
      updatedAt: nowIso(),
      expiresAt: nowIso(),
    });
  });
  if (changed) {
    writeLocks(S, nextLocks);
    var cfg = getNetworkAuthConfig();
    if (cfg && typeof window !== "undefined" && window.TC_SYNC && typeof window.TC_SYNC.syncStorageKeyNow === "function") {
      try {
        window.TC_SYNC.syncStorageKeyNow(INVOICE_EDIT_LOCKS_KEY, nextLocks);
      } catch (_e) { /* ignore */ }
    }
  }
  return changed;
}

export function renewInvoiceEditLock(S, saleId, identity, opts) {
  identity = identity || buildInvoiceEditLockIdentity();
  /* Never steal: only extend a lock this device already owns. */
  var active = findActiveInvoiceEditLock(readInvoiceEditLocks(S), saleId);
  if (active && String(active.deviceId || "") !== String(identity.deviceId || "")) {
    return {
      ok: false,
      conflict: active,
      message: formatInvoiceEditLockMessage(active),
    };
  }
  if (!active) {
    return {
      ok: false,
      message: "Edit lock expired. Close and re-open the invoice to edit.",
    };
  }
  var r = tryAcquireInvoiceEditLock(S, saleId, identity, opts);
  if (r && r.ok) {
    try {
      if (typeof window !== "undefined" && window.TC_SYNC && typeof window.TC_SYNC.syncStorageKeyNow === "function") {
        window.TC_SYNC.syncStorageKeyNow(INVOICE_EDIT_LOCKS_KEY, readInvoiceEditLocks(S));
      }
    } catch (_e) { /* ignore */ }
  }
  return r;
}

/**
 * Network-safe renew: refresh → confirm we still own → extend → push → verify.
 * Heartbeats should prefer this over local renewInvoiceEditLock.
 */
export async function renewInvoiceEditLockSynced(S, saleId, identity, opts) {
  identity = identity || buildInvoiceEditLockIdentity();
  await refreshInvoiceEditLocksFromServer(S);
  var active = findActiveInvoiceEditLock(readInvoiceEditLocks(S), saleId);
  if (active && String(active.deviceId || "") !== String(identity.deviceId || "")) {
    return {
      ok: false,
      conflict: active,
      message: formatInvoiceEditLockMessage(active),
    };
  }
  if (!active) {
    return {
      ok: false,
      message: "Edit lock expired. Close and re-open the invoice to edit.",
    };
  }
  var r = tryAcquireInvoiceEditLock(S, saleId, identity, opts);
  if (!r.ok) return r;

  var cfg = getNetworkAuthConfig();
  if (!cfg) return r;

  try {
    await syncStorageKeyNow(INVOICE_EDIT_LOCKS_KEY, readInvoiceEditLocks(S));
  } catch (_e) { /* continue to verify */ }

  try {
    if (typeof window !== "undefined" && window._tcRecentLocalWrites) {
      delete window._tcRecentLocalWrites[INVOICE_EDIT_LOCKS_KEY];
    }
  } catch (_e2) { /* ignore */ }

  await refreshInvoiceEditLocksFromServer(S);
  var again = findActiveInvoiceEditLock(readInvoiceEditLocks(S), saleId);
  if (!again) {
    return { ok: false, message: "Could not confirm edit lock with the server. Try again." };
  }
  if (String(again.deviceId || "") !== String(identity.deviceId || "")) {
    return {
      ok: false,
      conflict: again,
      message: formatInvoiceEditLockMessage(again),
    };
  }
  return { ok: true, lock: again };
}

/** Active lock owned by another device, or null. */
export function getForeignInvoiceEditLock(S, saleId, identity) {
  identity = identity || buildInvoiceEditLockIdentity();
  var active = findActiveInvoiceEditLock(readInvoiceEditLocks(S), saleId);
  if (!active) return null;
  if (String(active.deviceId || "") === String(identity.deviceId || "")) return null;
  return active;
}

/** Returns foreign active lock if another device currently owns the sale. */
export async function checkForeignInvoiceEditLock(S, saleId, identity) {
  identity = identity || buildInvoiceEditLockIdentity();
  await refreshInvoiceEditLocksFromServer(S);
  var active = findActiveInvoiceEditLock(readInvoiceEditLocks(S), saleId);
  if (!active) return null;
  if (String(active.deviceId || "") === String(identity.deviceId || "")) return null;
  return active;
}
