import { IS_PRODUCTION } from "../productionConfig.js";

/**
 * Techon ERP — Network Sync Engine v2
 * File: src/sync/SyncEngine.js
 *
 * Improvements over v1:
 *  - Persistent queue: unsynced items survive app restarts (stored in IndexedDB)
 *  - Auto-retry on startup: picks up any items that didn't sync before last close
 *  - X-TC-KEY auth header on every request
 *  - Client-side data validation before sending
 *  - Payload chunking for large arrays (100 items per chunk)
 *  - Structured logging (passed to main process via IPC)
 *  - flushNow() for before-close — returns true if everything saved
 *  - Exposes window.TC_SYNC with reactive status for UI
 */

/* ─── Status codes ──────────────────────────────────────────────── */
export const SYNC_STATUS = {
  IDLE:   'idle',    // nothing pending
  SAVING: 'saving',  // batch queued or in-flight
  SYNCED: 'synced',  // last batch saved ok
  FAILED: 'failed',  // last batch failed after retries
};

/* ─── Constants ─────────────────────────────────────────────────── */
const DEBOUNCE_MS       = 600;
const RECORD_DEBOUNCE_MS = 100;   /* business tables — near-instant LAN sync */
const MAX_RETRIES       = 3;
const RETRY_BASE_MS     = 2000;    // 2s → 4s → 8s
const CHUNK_SIZE        = 100;     // max array items per patch request
const MAX_PAYLOAD_BYTES = 512_000; // 500 KB per request
const QUEUE_IDB_KEY     = 'tc_sync_queue';
const IDB_NAME          = 'techon_erp_v1';
const IDB_VERSION       = 3;
const IDB_STORE         = 'kv';

/* ─── Module state ──────────────────────────────────────────────── */
let _config        = null;
let _debounceTimer = null;
let _pending       = {};          // { key: value } in-memory accumulator
let _queue         = [];          // persistent queue entries (loaded from IDB)
let _idbDB         = null;        // shared IDB reference
let _statusCbs     = [];
let _origSset      = null;        // original S.set before patching
let _patchRetryTimer = null;      // pending patchStorageSet retry — cleared on destroy
let _clientId      = null;
let _hydrating     = false;       // true while applying server → local (no outbound patches)
let _pullPaused    = false;       // true during pull apply (S.set writes from React)
let _flushDeferred = false;       // patches queued while hydrating/pull paused
let _retryInterval = null;
let _onFlushSuccess = null;       // optional callback after successful drain (App pulls server)
let _engineStarted = false;       // timers/queue drain armed (survives Strict Mode remount)
let _keyDebounceTimers = {};      // per-key debounce for direct push
let _keyPendingValues = {};       // value captured at S.set — survives pull/cache races
let _inflightKeys = {};             // keys currently being pushed
let _configReloadPromise = null;    // dedupe disk config reload

export const CLIENT_PULL_INTERVAL_MS = 2500; /* Pull server data every 2.5s on all network PCs */

export const NETWORK_KV_KEYS = [
  'tc3_settings', 'tc3_products', 'tc3_customers', 'tc3_suppliers', 'tc3_others',
  'tc3_sales', 'tc3_purchases', 'tc3_expenses', 'tc3_repairs',
  'tc3_assets', 'tc3_damageLog', 'tc3_productLog', 'tc3_repairDeleteLog',
  'tc3_salesReturns', 'tc3_purchaseReturns', 'tc3_quotations', 'tc3_cheques',
  'tc3_manualReceivables', 'tc3_manualPayables',
  'tc3_capLedger', 'tc3_capLog', 'tc3_profitDist', 'tc3_assetLog',
  'tc3_openBal', 'tc3_labelDesigns', 'tc3_businessType',
  'tc3_auditLog', 'tc3_admin_name', 'tc3_held_invoices',
  'tc3_journal_lines', 'tc3_gl_accounts', 'tc3_gl_mode', 'tc3_gl_audit',
  'tc3_journal_hash', 'tc3_gl_last_error', 'tc3_stock_movements',
  'tc3_inv_reconciliation', 'tc3_inventory_layers', 'tc3_financial_snapshots',
  'tc3_codRecords', 'tc3_codPartners',
  'tc3_codProfitSettings',
  'tc3_codWithdrawals',
  'tc3_invoice_edit_locks',
  'tc3_raw_material_usage',
  'tc3_raw_material_counts',
  'tc3_users',
];

const SYNC_KEY_SET = {};
NETWORK_KV_KEYS.forEach(function (k) { SYNC_KEY_SET[k] = true; });

export function setSyncHydrating(v) {
  _hydrating = !!v;
  if (!_hydrating) _maybeScheduleDeferredFlush();
}
export function setSyncPullPaused(v) {
  _pullPaused = !!v;
  if (!_pullPaused) _maybeScheduleDeferredFlush();
}
export function isSyncHydrating() { return _hydrating; }

/** Register callback invoked after a successful queue drain (used to pull server state). */
export function setSyncFlushCallback(fn) {
  _onFlushSuccess = typeof fn === 'function' ? fn : null;
}

/** True while a key has a debounced, queued, or in-flight push (pull merge keeps local-only rows). */
export function isSyncKeyPending(key) {
  if (!key) return false;
  if (_pending[key] !== undefined) return true;
  if (_keyPendingValues[key] !== undefined) return true;
  if (_inflightKeys[key]) return true;
  if (_keyDebounceTimers[key]) return true;
  for (var i = 0; i < _queue.length; i++) {
    if (_queue[i] && _queue[i].key === key) return true;
  }
  return false;
}

/** Normalize + validate network config (single shape for push/pull). */
function normalizeNetConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  var role = String(cfg.role || '').trim();
  if (role !== 'network_server' && role !== 'network_client') return null;
  var apiUrl = String(cfg.apiUrl || '').trim();
  if (!apiUrl) return null;
  if (apiUrl.charAt(apiUrl.length - 1) !== '/') apiUrl += '/';
  return Object.assign({}, cfg, { role: role, apiUrl: apiUrl });
}

function logConfigDebug(where) {
  var cfg = getActiveConfig();
  var src = 'none';
  try {
    if (typeof window !== 'undefined' && window._tcNetSyncConfig && window._tcNetSyncConfig.apiUrl) src = 'window._tcNetSyncConfig';
    else if (_config && _config.apiUrl) src = 'module._config';
  } catch (_) {}
  log('info', '[cfg:' + where + '] role=' + (cfg ? cfg.role : 'null')
    + ' apiUrl=' + (cfg ? cfg.apiUrl : 'null')
    + ' source=' + src
    + ' netRole=' + (typeof window !== 'undefined' ? String(window._tcNetRole || '') : ''));
}

/** Active network config — single source for push; mirrors window._tcNetSyncConfig. */
function getActiveConfig() {
  try {
    if (typeof window !== 'undefined' && window._tcNetSyncConfig) {
      var fromWin = normalizeNetConfig(window._tcNetSyncConfig);
      if (fromWin) {
        _config = fromWin;
        return fromWin;
      }
    }
  } catch (_) {}
  var fromMod = normalizeNetConfig(_config);
  if (fromMod) {
    try {
      if (typeof window !== 'undefined') window._tcNetSyncConfig = fromMod;
    } catch (_) {}
    return fromMod;
  }
  return null;
}

/**
 * Set sync config immediately (before async init). Call as soon as network role + apiUrl are known.
 */
export function ensureSyncConfig(config) {
  var normalized = normalizeNetConfig(config);
  if (!normalized) return;
  _config = normalized;
  try {
    if (typeof window !== 'undefined') {
      window._tcNetSyncConfig = normalized;
      window.__TC_SYNC_DIRECT__ = true;
    }
  } catch (_) {}
  log('info', '[cfg:ensureSyncConfig] role=' + normalized.role + ' apiUrl=' + normalized.apiUrl);
}

/** Reload tc_network.json from main process (same file IPC push uses). */
export function ensureSyncConfigFromDisk() {
  if (_configReloadPromise) return _configReloadPromise;
  _configReloadPromise = (async function () {
    try {
      if (typeof window === 'undefined' || !window.electronAPI || typeof window.electronAPI.loadNetworkConfig !== 'function') {
        return null;
      }
      var cfg = await window.electronAPI.loadNetworkConfig();
      var normalized = normalizeNetConfig(cfg);
      if (normalized) {
        ensureSyncConfig(normalized);
        try { if (typeof window !== 'undefined') window._tcNetRole = normalized.role; } catch (_) {}
        log('info', '[cfg:disk] reloaded role=' + normalized.role + ' apiUrl=' + normalized.apiUrl);
      }
      return normalized;
    } catch (e) {
      log('error', '[cfg:disk] reload failed: ' + (e && e.message ? e.message : e));
      return null;
    } finally {
      _configReloadPromise = null;
    }
  })();
  return _configReloadPromise;
}

const RECORD_SYNC_KEYS = {
  tc3_products: 1, tc3_customers: 1, tc3_suppliers: 1, tc3_sales: 1,
  tc3_purchases: 1, tc3_expenses: 1, tc3_repairs: 1, tc3_assets: 1,
  tc3_salesReturns: 1, tc3_purchaseReturns: 1, tc3_quotations: 1, tc3_cheques: 1,
  tc3_manualReceivables: 1, tc3_manualPayables: 1,
  tc3_invoice_edit_locks: 1,
  tc3_raw_material_usage: 1,
  tc3_raw_material_counts: 1,
};

function _syncPaused() { return _hydrating || _pullPaused; }

function _maybeScheduleDeferredFlush() {
  var cfg = getActiveConfig();
  if (_syncPaused() || !_flushDeferred || !cfg || cfg.role === 'standalone') return;
  if (Object.keys(_pending).length === 0) {
    _flushDeferred = false;
    return;
  }
  _flushDeferred = false;
  var keys = Object.keys(_pending);
  keys.forEach(function (k) { syncStorageKey(k); });
}

function _scheduleFlushDebounce() {
  clearTimeout(_debounceTimer);
  var delay = DEBOUNCE_MS;
  for (var k in _pending) {
    if (RECORD_SYNC_KEYS[k]) { delay = RECORD_DEBOUNCE_MS; break; }
  }
  _debounceTimer = setTimeout(flush, delay);
}

/* ─── Public singleton ──────────────────────────────────────────── */
export const TC_SYNC = {
  status:       SYNC_STATUS.IDLE,
  lastSyncTime: null,
  failedKeys:   [],
  pendingCount: 0,

  onStatus(cb) {
    _statusCbs.push(cb);
    return () => { _statusCbs = _statusCbs.filter(f => f !== cb); };
  },
};

/* ─── Status update ─────────────────────────────────────────────── */
function setStatus(s, extra = {}) {
  TC_SYNC.status = s;
  Object.assign(TC_SYNC, extra);
  _statusCbs.forEach(cb => { try { cb(s, TC_SYNC); } catch (_) {} });
}

/** After direct push (syncStorageKeyNow), clear stuck "saving" when nothing left in flight. */
function updateStatusAfterDirectPush() {
  var pendingN = Object.keys(_pending).length;
  var debounceN = Object.keys(_keyDebounceTimers).length;
  var inflightN = Object.keys(_inflightKeys).length;
  if (_queue.length > 0) return;
  if (pendingN > 0 || debounceN > 0 || inflightN > 0) {
    setStatus(SYNC_STATUS.SAVING, { pendingCount: pendingN + debounceN + inflightN });
    return;
  }
  setStatus(SYNC_STATUS.SYNCED, {
    lastSyncTime: new Date().toISOString(),
    failedKeys: [],
    pendingCount: 0,
  });
}

/* ─── Client ID ─────────────────────────────────────────────────── */
function getClientId() {
  if (_clientId) return _clientId;
  let id = localStorage.getItem('tc_net_client_id');
  if (!id) {
    id = 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('tc_net_client_id', id);
  }
  _clientId = id;
  return id;
}

export function getSyncClientId() {
  return getClientId();
}

/* ─── Logging (writes to main process via IPC) ──────────────────── */
function log(level, message) {
  try {
    if (window.electronAPI && window.electronAPI.writeLog) {
      window.electronAPI.writeLog({ level, message: '[SyncEngine] ' + message });
    }
    if (IS_PRODUCTION) return;
    if (level === 'error') console.error('[TC_SYNC]', message);
    else console.log('[TC_SYNC]', message);
  } catch (_) {}
}

/* ─── IDB helpers ───────────────────────────────────────────────── */
function getIDB() {
  if (_idbDB) return Promise.resolve(_idbDB);
  function openAt(ver) {
    return new Promise((resolve) => {
      const req = indexedDB.open(IDB_NAME, ver);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = e => { _idbDB = e.target.result; resolve(_idbDB); };
      req.onerror = () => {
        const err = req.error;
        if (err && err.name === 'VersionError') {
          const m = String(err.message || '').match(/existing version \((\d+)\)/i);
          if (m) {
            const existing = parseInt(m[1], 10);
            if (existing > ver) {
              openAt(existing).then(resolve);
              return;
            }
          }
        }
        resolve(null);
      };
    });
  }
  if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
    return indexedDB.databases().then((list) => {
      const row = (list || []).find((d) => d && d.name === IDB_NAME);
      const existing = row && row.version ? Number(row.version) : 0;
      return openAt(Math.max(IDB_VERSION, existing));
    }).catch(() => openAt(IDB_VERSION));
  }
  return openAt(IDB_VERSION);
}

async function idbGet(key) {
  try {
    const db = await getIDB();
    if (!db) return null;
    return new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => resolve(null);
    });
  } catch (_) { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await getIDB();
    if (!db) return;
    const tx  = db.transaction(IDB_STORE, 'readwrite');
    if (value === null || value === undefined) {
      tx.objectStore(IDB_STORE).delete(key);
    } else {
      tx.objectStore(IDB_STORE).put(value, key);
    }
  } catch (_) {}
}

/* ─── Persistent queue ──────────────────────────────────────────── */
async function loadQueue() {
  const saved = await idbGet(QUEUE_IDB_KEY);
  _queue = Array.isArray(saved) ? saved : [];
  TC_SYNC.pendingCount = _queue.length;
  log('info', 'Loaded ' + _queue.length + ' pending items from queue');
}

async function saveQueue() {
  TC_SYNC.pendingCount = _queue.length;
  await idbSet(QUEUE_IDB_KEY, _queue.length > 0 ? _queue : null);
}

function enqueue(key, value) {
  /* Replace existing entry for same key (only keep latest value) */
  _queue = _queue.filter(e => e.key !== key);
  _queue.push({ id: Date.now() + '_' + Math.random().toString(36).slice(2, 6), key, value, attempts: 0, ts: Date.now() });
  saveQueue(); /* async — fire and forget */
  TC_SYNC.pendingCount = _queue.length;
}

async function dequeue(keys) {
  _queue = _queue.filter(e => !keys.includes(e.key));
  TC_SYNC.pendingCount = _queue.length;
  await saveQueue();
}

/* ─── Data Validators ───────────────────────────────────────────── */
const VALIDATORS = {
  tc3_products(v) {
    if (!Array.isArray(v)) return 'tc3_products must be an array';
    for (const p of v) {
      if (typeof p !== 'object' || p === null) return 'Product item is not an object';
      if (p.id == null && p.productId == null) return 'Product item missing id';
    }
    return null;
  },
  tc3_customers(v) {
    if (!Array.isArray(v)) return 'tc3_customers must be an array';
    return null;
  },
  tc3_suppliers(v) {
    if (!Array.isArray(v)) return 'tc3_suppliers must be an array';
    return null;
  },
  tc3_others(v) {
    if (!Array.isArray(v)) return 'tc3_others must be an array';
    return null;
  },
  tc3_sales(v) {
    if (!Array.isArray(v)) return 'tc3_sales must be an array';
    return null;
  },
  tc3_purchases(v) {
    if (!Array.isArray(v)) return 'tc3_purchases must be an array';
    return null;
  },
  tc3_settings(v) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return 'tc3_settings must be an object';
    return null;
  },
};

function validate(key, value) {
  if (value === null || value === undefined) return null;
  const fn = VALIDATORS[key];
  return fn ? fn(value) : null;
}

/* ─── Chunking ──────────────────────────────────────────────────── */
function chunkPatches(patches) {
  const groups = [];
  let current  = [];
  let currentSize = 0;

  for (const patch of patches) {
    let serialised;
    try { serialised = JSON.stringify(patch.value); } catch (_) { continue; }

    /* Array chunking: split large arrays into CHUNK_SIZE slices */
    if (Array.isArray(patch.value) && patch.value.length > CHUNK_SIZE) {
      /* Flush current group first */
      if (current.length > 0) { groups.push(current); current = []; currentSize = 0; }

      for (let i = 0; i < patch.value.length; i += CHUNK_SIZE) {
        /* Each chunk gets a unique patch_id derived from the original so server can dedup per chunk */
        const chunkPatchId = patch.patch_id ? patch.patch_id + '_c' + (i / CHUNK_SIZE) : undefined;
        const entry = { key: patch.key, value: patch.value.slice(i, i + CHUNK_SIZE), _chunk: true };
        if (chunkPatchId) entry.patch_id = chunkPatchId;
        groups.push([entry]);
      }
      continue;
    }

    const size = new Blob([serialised]).size;
    if (currentSize + size > MAX_PAYLOAD_BYTES && current.length > 0) {
      groups.push(current);
      current     = [];
      currentSize = 0;
    }
    current.push(patch);
    currentSize += size;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/* ─── HTTP helper ───────────────────────────────────────────────── */
/** Prefer main-process lanPost (reads apiKey from disk) — same reliable path as license sync. */
async function postSyncPatch(body) {
  var keys = (body && body.patches) ? body.patches.map(function (p) { return p && p.key; }).filter(Boolean).join(',') : '';
  try {
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.syncPatch === 'function') {
      log('info', '[push:IPC] electronAPI.syncPatch keys=[' + keys + ']');
      const json = await window.electronAPI.syncPatch(body);
      if (json && json.success) {
        log('info', '[push:IPC] ok keys=[' + keys + '] msg=' + (json.message || 'ok'));
        return json;
      }
      if (json && json.success === false) {
        log('error', '[push:IPC] rejected keys=[' + keys + '] msg=' + (json.message || 'failed') + ' — trying fetch fallback');
      } else if (json && typeof json === 'object') {
        return json;
      }
    }
  } catch (e) {
    log('error', '[push:IPC] error keys=[' + keys + ']: ' + (e && e.message ? e.message : e));
  }
  log('info', '[push:fetch] POST sync_patch.php keys=[' + keys + ']');
  const fetchJson = await post('sync_patch.php', body);
  log('info', '[push:fetch] response keys=[' + keys + '] success=' + !!(fetchJson && fetchJson.success));
  return fetchJson;
}

async function post(endpoint, body) {
  const cfg = getActiveConfig();
  const apiUrl = cfg && cfg.apiUrl;
  if (!apiUrl) throw new Error('API URL not configured');

  const headers = {
    'Content-Type': 'application/json',
    'X-TC-Client-ID': getClientId(),
  };
  if (cfg.apiKey) headers['X-TC-KEY'] = cfg.apiKey;

  var fetchOpts = {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  };
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      fetchOpts.signal = AbortSignal.timeout(30000);
    }
  } catch (_e) { /* ignore */ }

  const res = await fetch(apiUrl + endpoint, fetchOpts);

  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function get(endpoint) {
  const cfg = getActiveConfig();
  const apiUrl = cfg && cfg.apiUrl;
  if (!apiUrl) throw new Error('API URL not configured');

  try {
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.lanRequest === 'function') {
      const r = await window.electronAPI.lanRequest({
        method: 'GET',
        path: endpoint,
        clientId: getClientId(),
      });
      if (r && r.success && r.data) return r.data;
      if (r && r.data) return r.data;
      throw new Error((r && r.message) || 'LAN GET failed');
    }
  } catch (e) {
    log('warn', '[get:IPC] fallback to fetch: ' + (e && e.message ? e.message : e));
  }

  const headers = { 'X-TC-Client-ID': getClientId() };
  if (cfg.apiKey) headers['X-TC-KEY'] = cfg.apiKey;
  try {
    if (window.electronAPI && window.electronAPI.getDeviceAuthHeaders) {
      const ah = await window.electronAPI.getDeviceAuthHeaders({
        method: 'GET',
        url: apiUrl + endpoint.replace(/^\//, ''),
        body: '',
      });
      if (ah && ah.headers) Object.assign(headers, ah.headers);
    }
  } catch (_e) { /* legacy only */ }

  const res = await fetch(apiUrl + endpoint, {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ─── Send a batch of patches ───────────────────────────────────── */
/**
 * Sends patches to the server and only returns keys the server confirmed
 * as saved (present in data.saved).  Keys absent from data.saved — even if
 * the HTTP call succeeded — are NOT counted as synced and stay in the queue.
 *
 * Each non-chunked patch carries its queue-entry patch_id so the server can
 * skip duplicate submissions (idempotency via processed_patches table).
 */
async function sendBatch(patches) {
  const groups   = chunkPatches(patches);
  const sentKeys = [];
  const patchKeys = patches.map(function (p) { return p && p.key; }).filter(Boolean).join(',');
  log('info', '[push:sendBatch] keys=[' + patchKeys + '] groups=' + groups.length);

  for (const group of groups) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const json = await postSyncPatch({ patches: group, client_id: getClientId() });

        /* Server must confirm which keys were actually saved or skipped as duplicate */
        const confirmed = (json.data && Array.isArray(json.data.saved)) ? json.data.saved : [];
        const duplicates = (json.data && Array.isArray(json.data.duplicates)) ? json.data.duplicates : [];
        const successKeys = [...new Set([...confirmed, ...duplicates])];

        if (!json.success && successKeys.length === 0) {
          throw new Error(json.message || 'Server rejected patch');
        }

        /* Chunked patches may not return per-key confirmed (server merges) */
        if (successKeys.length === 0 && group.every(p => p._chunk)) {
          /* For chunk groups treat as success if server responded ok */
          sentKeys.push(...group.map(p => p.key));
        } else {
          sentKeys.push(...successKeys);
        }

        if (successKeys.length === 0 && !group.every(p => p._chunk)) {
          log('error', 'Server returned no confirmed saves — keys not cleared: ' + group.map(p => p.key).join(','));
        }
        break;
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
        } else {
          log('error', 'Patch failed after ' + (MAX_RETRIES + 1) + ' attempts: ' + err.message);
          throw err;
        }
      }
    }
  }
  return sentKeys;
}

/* ─── Flush the in-memory pending map → queue → server ─────────── */
async function flush() {
  const cfg = getActiveConfig();
  if (!cfg || !cfg.apiUrl || Object.keys(_pending).length === 0) return;

  /* Move pending into persistent queue */
  const toSend = { ..._pending };
  _pending = {};

  for (const [key, value] of Object.entries(toSend)) {
    const err = validate(key, value);
    if (err) {
      log('error', 'Validation failed for ' + key + ': ' + err);
      continue;
    }
    enqueue(key, value);
  }

  await drainQueue();
}

/* ─── Drain the persistent queue ───────────────────────────────── */
async function drainQueue() {
  if (_queue.length === 0) {
    setStatus(SYNC_STATUS.IDLE, { failedKeys: [], pendingCount: 0 });
    return;
  }

  setStatus(SYNC_STATUS.SAVING, { pendingCount: _queue.length });

  /* Always send the latest in-memory value — queue may hold a stale snapshot from a prior session */
  const cache = (typeof window !== 'undefined' && window._idbCache) ? window._idbCache : null;
  const patches  = _queue.map(e => ({
    key: e.key,
    value: (cache && cache[e.key] !== undefined && cache[e.key] !== null) ? cache[e.key] : e.value,
    patch_id: e.id,
  }));
  const savedKeys = [];
  const failedKeys = [];

  try {
    const sent = await sendBatch(patches);
    savedKeys.push(...sent);
  } catch (err) {
    /* Partial failure — mark unconfirmed keys as failed */
    failedKeys.push(...patches.map(p => p.key));
    log('error', 'drainQueue failed: ' + err.message);
  }

  /* Remove saved items from queue */
  if (savedKeys.length > 0) await dequeue(savedKeys);

  if (failedKeys.length > 0) {
    setStatus(SYNC_STATUS.FAILED, { failedKeys, pendingCount: _queue.length });
  } else if (_queue.length === 0) {
    setStatus(SYNC_STATUS.SYNCED, {
      lastSyncTime: new Date().toISOString(),
      failedKeys: [],
      pendingCount: 0,
    });
    log('info', 'All patches synced. Keys: ' + savedKeys.join(', '));
    if (_onFlushSuccess && savedKeys.length > 0) {
      try { _onFlushSuccess(savedKeys); } catch (_) {}
    }
  }
}

/** Push one key to server immediately (same path as manual Upload — both roles). */
export async function syncStorageKeyNow(key, optValue) {
  var cfg = getActiveConfig();
  if (!cfg) {
    cfg = await ensureSyncConfigFromDisk();
  }
  if (!cfg || cfg.role === 'standalone' || !cfg.apiUrl) {
    logConfigDebug('syncStorageKeyNow:blocked');
    return { ok: false, message: 'No network config' };
  }
  if (!SYNC_KEY_SET[key]) return { ok: false };

  const cache = (typeof window !== 'undefined' && window._idbCache) ? window._idbCache : {};
  const value = optValue !== undefined ? optValue : cache[key];
  if (value === undefined || value === null) {
    log('error', '[push:syncStorageKeyNow] no value for ' + key);
    return { ok: false };
  }

  const err = validate(key, value);
  if (err) {
    log('error', 'syncStorageKeyNow validate ' + key + ': ' + err);
    return { ok: false, message: err };
  }

  if (_inflightKeys[key]) {
    _keyPendingValues[key] = value;
    return { ok: false, inflight: true };
  }

  _inflightKeys[key] = true;
  try {
    log('info', '[push:syncStorageKeyNow] key=' + key + ' role=' + cfg.role + ' apiUrl=' + cfg.apiUrl);
    const sent = await sendBatch([{ key, value }]);
    const ok = sent.indexOf(key) >= 0;
    if (ok) {
      log('info', '[push:syncStorageKeyNow] server saved ' + key);
      try {
        if (typeof window !== 'undefined') {
          window._tcRecentLocalWrites = window._tcRecentLocalWrites || {};
          window._tcRecentLocalWrites[key] = Date.now();
        }
      } catch (_) {}
      if (_onFlushSuccess) {
        try { _onFlushSuccess([key]); } catch (_) {}
      }
    } else {
      log('error', '[push:syncStorageKeyNow] server did not confirm ' + key);
    }
    return { ok, saved: sent };
  } catch (e) {
    log('error', '[push:syncStorageKeyNow] failed ' + key + ': ' + (e && e.message ? e.message : e));
    return { ok: false, message: e && e.message ? e.message : String(e) };
  } finally {
    delete _inflightKeys[key];
    if (_keyPendingValues[key] !== undefined) {
      var retryVal = _keyPendingValues[key];
      delete _keyPendingValues[key];
      if (retryVal !== undefined && retryVal !== null) {
        setTimeout(function () { syncStorageKeyNow(key, retryVal); }, 50);
      }
    }
    updateStatusAfterDirectPush();
  }
}

/** Debounced direct push — call from S.set on every business-data write. */
export function syncStorageKey(key, optValue) {
  if (!SYNC_KEY_SET[key]) return;
  if (_syncPaused()) {
    const cachePaused = (typeof window !== 'undefined' && window._idbCache) ? window._idbCache : {};
    const pausedVal = optValue !== undefined ? optValue : cachePaused[key];
    if (pausedVal === undefined || pausedVal === null) return;
    _keyPendingValues[key] = pausedVal;
    _pending[key] = pausedVal;
    _flushDeferred = true;
    return;
  }

  const cache = (typeof window !== 'undefined' && window._idbCache) ? window._idbCache : {};
  const value = optValue !== undefined ? optValue : cache[key];
  if (value === undefined || value === null) return;

  const err = validate(key, value);
  if (err) { log('error', 'syncStorageKey skip ' + key + ': ' + err); return; }

  _keyPendingValues[key] = value;
  _pending[key] = value;

  var cfg = getActiveConfig();
  if (!cfg) {
    logConfigDebug('syncStorageKey:noCfg');
    ensureSyncConfigFromDisk().then(function (c) {
      if (c) syncStorageKey(key, _keyPendingValues[key] !== undefined ? _keyPendingValues[key] : value);
      else updateStatusAfterDirectPush();
    });
    return;
  }

  setStatus(SYNC_STATUS.SAVING, { pendingCount: Object.keys(_pending).length + Object.keys(_keyDebounceTimers).length });

  log('info', '[push:syncStorageKey] schedule key=' + key + ' role=' + cfg.role);

  clearTimeout(_keyDebounceTimers[key]);
  var delay = RECORD_SYNC_KEYS[key] ? RECORD_DEBOUNCE_MS : DEBOUNCE_MS;
  var captured = value;
  _keyDebounceTimers[key] = setTimeout(function () {
    delete _keyDebounceTimers[key];
    delete _pending[key];
    var pushVal = _keyPendingValues[key] !== undefined ? _keyPendingValues[key] : captured;
    delete _keyPendingValues[key];
    syncStorageKeyNow(key, pushVal).finally(function () {
      updateStatusAfterDirectPush();
    });
  }, delay);
}

/** Flush all pending keys (before close). */
export async function flushAllPendingKeys() {
  clearTimeout(_debounceTimer);
  Object.keys(_keyDebounceTimers).forEach(function (k) {
    clearTimeout(_keyDebounceTimers[k]);
    delete _keyDebounceTimers[k];
  });
  const keys = Object.keys(_pending);
  _pending = {};
  _flushDeferred = false;
  var allOk = true;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var v = _keyPendingValues[k];
    const r = await syncStorageKeyNow(k, v);
    if (!r.ok) allOk = false;
  }
  return allOk;
}
/* ─── Queue a patch (debounced) — delegates to direct push ───────── */
export function queuePatch(key, value) {
  const cfg = getActiveConfig();
  if (!cfg || cfg.role === 'standalone') return;
  if (value !== undefined && value !== null) {
    _pending[key] = value;
  }
  syncStorageKey(key);
}

/* ─── Force flush (used before app close) ───────────────────────── */
export async function flushNow() {
  return flushAllPendingKeys();
}

/* ─── Load full state from server ───────────────────────────────── */
const SERVER_STATE_KEY_RE = /^tc3_[a-zA-Z0-9_]+$/;

/**
 * @param {string} apiUrl
 * @param {string[]|null} keys  Optional key filter for server_state.php
 * @param {{ authConfig?: { apiKey?: string } }|null} opts  If authConfig is set, it is used for X-TC-KEY
 *   (survives destroySyncEngine() / Strict Mode where module _config may be null during fetch).
 */
export async function loadStateFromServer(apiUrl, keys = null, opts = null) {
  let path = 'server_state.php';
  if (keys && keys.length) {
    const safe = keys.filter((k) => typeof k === 'string' && SERVER_STATE_KEY_RE.test(k));
    if (safe.length) {
      path += '?keys=' + safe.map((k) => encodeURIComponent(k)).join(',');
    }
  }
  const url = path;
  const cfg = (opts && opts.authConfig) || _config || {};

  try {
    if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.lanRequest === 'function') {
      const r = await window.electronAPI.lanRequest({
        method: 'GET',
        path: url,
        clientId: getClientId(),
      });
      const json = (r && r.data) || r;
      if (json && json.success === false) throw new Error(json.message || 'Server state load failed');
      if (json && json.data !== undefined) return json.data;
      if (json && json.success && json.data) return json.data;
    }
  } catch (e) {
    log('warn', '[loadState:IPC] fallback to fetch: ' + (e && e.message ? e.message : e));
  }

  const headers = { 'X-TC-Client-ID': getClientId() };
  if (cfg.apiKey) headers['X-TC-KEY'] = cfg.apiKey;
  try {
    if (window.electronAPI && window.electronAPI.getDeviceAuthHeaders) {
      const fullUrl = apiUrl + url;
      const ah = await window.electronAPI.getDeviceAuthHeaders({ method: 'GET', url: fullUrl, body: '' });
      if (ah && ah.headers) Object.assign(headers, ah.headers);
    }
  } catch (_e) { /* legacy */ }

  const res = await fetch(apiUrl + url, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('Server returned HTTP ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Server state load failed');
  return json.data;
}

/** Push selected keys from window._idbCache to server (manual upload + bootstrap). */
export async function pushKeysToServer(keys, opts = null) {
  const cfg = (opts && opts.authConfig) || getActiveConfig() || {};
  if (!cfg.apiUrl) {
    return { ok: false, message: 'API URL not configured' };
  }
  if (cfg.role !== 'network_server' && cfg.role !== 'network_client') {
    return { ok: false, message: 'Not network mode' };
  }
  const cache = (typeof window !== 'undefined' && window._idbCache) ? window._idbCache : {};
  const patches = [];
  (keys || NETWORK_KV_KEYS).forEach(function (k) {
    if (cache[k] !== undefined && cache[k] !== null) {
      patches.push({ key: k, value: cache[k] });
    }
  });
  if (!patches.length) return { ok: false, message: 'No shop data found on this PC to upload' };
  const savedConfig = _config;
  try {
    _config = cfg;
    const sent = await sendBatch(patches);
    return { ok: sent.length > 0, saved: sent, message: sent.length > 0 ? 'Uploaded' : 'Server did not confirm save' };
  } finally {
    _config = savedConfig;
  }
}

/** If MySQL kv_store is empty or behind local data, upload from this PC. */
export async function bootstrapServerKvFromLocal(apiUrl, authConfig) {
  if (!_config || _config.role !== 'network_server') return { ok: false };
  const cfg = authConfig || _config || {};
  const probe = await loadStateFromServer(apiUrl, ['tc3_products', 'tc3_sales', 'tc3_customers', 'tc3_quotations'], { authConfig: cfg });
  const cache = (typeof window !== 'undefined' && window._idbCache) ? window._idbCache : {};
  const serverProducts = Array.isArray(probe.tc3_products) ? probe.tc3_products.length : 0;
  const serverSales = Array.isArray(probe.tc3_sales) ? probe.tc3_sales.length : 0;
  const serverCustomers = Array.isArray(probe.tc3_customers) ? probe.tc3_customers.length : 0;
  const localProducts = Array.isArray(cache.tc3_products) ? cache.tc3_products.length : 0;
  const localSales = Array.isArray(cache.tc3_sales) ? cache.tc3_sales.length : 0;
  const localCustomers = Array.isArray(cache.tc3_customers) ? cache.tc3_customers.length : 0;
  const serverEmpty = serverProducts === 0 && serverSales === 0 && serverCustomers === 0;
  const localHasData = localProducts > 0 || localSales > 0 || localCustomers > 0;
  const serverBehind = localProducts > serverProducts || localSales > serverSales || localCustomers > serverCustomers;
  if (!localHasData) {
    return { ok: true, message: 'No local data to push' };
  }
  if (!serverEmpty && !serverBehind) {
    return { ok: true, message: 'Server already has data' };
  }
  log('info', 'Bootstrapping local shop data to server MySQL (server empty or behind local)');
  return pushKeysToServer(NETWORK_KV_KEYS);
}

/* ─── Patch window._tcS.set ─────────────────────────────────────── */
function patchStorageSet() {
  if (typeof window !== 'undefined' && window.__TC_SYNC_DIRECT__) {
    if (window._tcS) window._tcS.__synced = false;
    log('info', 'Direct storage sync enabled; wrapper patch skipped');
    return;
  }
  if (!window._tcS) {
    if (_patchRetryTimer) clearTimeout(_patchRetryTimer);
    _patchRetryTimer = setTimeout(function () {
      _patchRetryTimer = null;
      patchStorageSet();
    }, 200);
    return;
  }
  /* Strict guard: never double-wrap (Strict Mode / HMR / repeated initSyncEngine) */
  if (window._tcS.__synced) return;

  _origSset = window._tcS.set.bind(window._tcS);
  window._tcS.set = function (k, v) {
    _origSset(k, v);
    queuePatch(k, v);
  };
  window._tcS.__synced = true;
  log('info', 'Storage.set patched for network sync');
}

function unpatchStorageSet() {
  if (_patchRetryTimer) {
    clearTimeout(_patchRetryTimer);
    _patchRetryTimer = null;
  }
  if (window._tcS && _origSset) {
    window._tcS.set = _origSset;
    _origSset = null;
  }
  if (window._tcS) window._tcS.__synced = false;
}

/* ─── Init ──────────────────────────────────────────────────────── */
export async function initSyncEngine(config) {
  ensureSyncConfig(config);
  clearTimeout(_debounceTimer);

  /* Expose on window — methods are on TC_SYNC even before async init finishes */
  if (typeof window !== 'undefined') {
    window.TC_SYNC = TC_SYNC;
    if (!window.TC_SYNC.queuePatch) window.TC_SYNC.queuePatch = queuePatch;
    if (!window.TC_SYNC.flushNow) window.TC_SYNC.flushNow = flushNow;
    if (!window.TC_SYNC.pushKeysToServer) window.TC_SYNC.pushKeysToServer = pushKeysToServer;
    window.TC_SYNC.bootstrapServerKv = function () {
      return bootstrapServerKvFromLocal(config.apiUrl, config);
    };
  }

  if (!config || config.role === 'standalone') {
    _engineStarted = false;
    _pending = {};
    _flushDeferred = false;
    if (_retryInterval) {
      clearInterval(_retryInterval);
      _retryInterval = null;
    }
    try {
      if (typeof window !== 'undefined') {
        window._tcNetSyncConfig = null;
        window.__TC_SYNC_DIRECT__ = false;
      }
    } catch (_) {}
    unpatchStorageSet();
    setStatus(SYNC_STATUS.IDLE);
    return;
  }

  /* Strict Mode remount: keep pending patches + config; only arm timers once */
  if (_engineStarted) {
    patchStorageSet();
    _maybeScheduleDeferredFlush();
    return;
  }
  _engineStarted = true;
  log('info', 'Sync engine starting (' + config.role + ') → ' + config.apiUrl);

  /* Load any items that didn't sync before last close */
  await loadQueue();

  /* Patch storage before draining so new writes don't race */
  patchStorageSet();

  /* Start periodic background retry timer (every 5 seconds) to drain the queue if it gets stuck */
  _retryInterval = setInterval(async () => {
    if (_queue.length > 0 && TC_SYNC.status !== SYNC_STATUS.SAVING && !_syncPaused()) {
      log('info', 'Periodic retry: draining queue with ' + _queue.length + ' item(s)');
      await drainQueue();
    }
  }, 5000);

  /* Drain leftover queue from previous session */
  if (_queue.length > 0) {
    log('info', 'Retrying ' + _queue.length + ' unsynced item(s) from last session');
    await drainQueue();
  } else {
    setStatus(SYNC_STATUS.IDLE);
  }

  /* Patches queued during startup pull/hydration must not be lost */
  if (Object.keys(_pending).length > 0 || _flushDeferred) {
    _maybeScheduleDeferredFlush();
  }
}

export function destroySyncEngine() {
  clearTimeout(_debounceTimer);
  _debounceTimer = null;
  if (_retryInterval) {
    clearInterval(_retryInterval);
    _retryInterval = null;
  }
  if (_patchRetryTimer) {
    clearTimeout(_patchRetryTimer);
    _patchRetryTimer = null;
  }
  _engineStarted = false;
  unpatchStorageSet();
  try {
    if (_idbDB) {
      try { _idbDB.close(); } catch (_e) {}
      _idbDB = null;
    }
  } catch (_e2) {}
  /* Keep _config, _pending, _onFlushSuccess, and window._tcNetSyncConfig */
  _config = getActiveConfig();
}

/**
 * Append (or prepend) one row to a large tc3_* array via App’s S wrapper — avoids UI code holding
 * `[newRow].concat(entireHistory)` for persistence. opts.prepend: true for newest-first (e.g. sales).
 */
export function appendStorageRecord(key, record, opts) {
  if (typeof window !== 'undefined' && window._tcS && typeof window._tcS.appendRecord === 'function') {
    return window._tcS.appendRecord(key, record, opts);
  }
  return null;
}

/* ─── Utility ────────────────────────────────────────────────────── */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Exposed for automated tests (chunking / validation invariants only). */
export { chunkPatches, validate as validateSyncStorageValue };

/* Attach API helpers to singleton immediately so Settings / IPC can call before async init */
TC_SYNC.queuePatch = queuePatch;
TC_SYNC.flushNow = flushNow;
TC_SYNC.pushKeysToServer = pushKeysToServer;
TC_SYNC.ensureSyncConfig = ensureSyncConfig;
TC_SYNC.ensureSyncConfigFromDisk = ensureSyncConfigFromDisk;
TC_SYNC.syncStorageKey = syncStorageKey;
TC_SYNC.syncStorageKeyNow = syncStorageKeyNow;
TC_SYNC.isKeyPending = isSyncKeyPending;
