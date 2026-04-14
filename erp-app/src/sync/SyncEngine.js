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
const MAX_RETRIES       = 3;
const RETRY_BASE_MS     = 2000;    // 2s → 4s → 8s
const CHUNK_SIZE        = 100;     // max array items per patch request
const MAX_PAYLOAD_BYTES = 512_000; // 500 KB per request
const QUEUE_IDB_KEY     = 'tc_sync_queue';
const IDB_NAME          = 'techon_erp_v1';
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
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = e => { _idbDB = e.target.result; resolve(_idbDB); };
    req.onerror   = () => resolve(null);
  });
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
      if (!p.id && p.id !== 0) return 'Product item missing id';
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
async function post(endpoint, body) {
  const apiUrl = _config && _config.apiUrl;
  if (!apiUrl) throw new Error('API URL not configured');

  const headers = {
    'Content-Type': 'application/json',
    'X-TC-Client-ID': getClientId(),
  };
  if (_config.apiKey) headers['X-TC-KEY'] = _config.apiKey;

  const res = await fetch(apiUrl + endpoint, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30000),
  });

  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function get(endpoint) {
  const apiUrl = _config && _config.apiUrl;
  if (!apiUrl) throw new Error('API URL not configured');

  const headers = { 'X-TC-Client-ID': getClientId() };
  if (_config.apiKey) headers['X-TC-KEY'] = _config.apiKey;

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

  for (const group of groups) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const json = await post('sync_patch.php', { patches: group, client_id: getClientId() });

        /* Server must confirm which keys were actually saved */
        const confirmed = (json.data && Array.isArray(json.data.saved)) ? json.data.saved : [];

        if (!json.success && confirmed.length === 0) {
          throw new Error(json.message || 'Server rejected patch');
        }

        /* Chunked patches may not return per-key confirmed (server merges) */
        if (confirmed.length === 0 && group.every(p => p._chunk)) {
          /* For chunk groups treat as success if server responded ok */
          sentKeys.push(...group.map(p => p.key));
        } else {
          sentKeys.push(...confirmed);
        }

        if (confirmed.length === 0 && !group.every(p => p._chunk)) {
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
  if (!_config || !_config.apiUrl || Object.keys(_pending).length === 0) return;

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

  /* Include each entry's stable ID as patch_id for server-side dedup */
  const patches  = _queue.map(e => ({ key: e.key, value: e.value, patch_id: e.id }));
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
  }
}

/* ─── Queue a patch (debounced) ─────────────────────────────────── */
export function queuePatch(key, value) {
  if (!_config || _config.role === 'standalone') return;

  const err = validate(key, value);
  if (err) { log('error', 'Skipping invalid patch for ' + key + ': ' + err); return; }

  _pending[key] = value;
  setStatus(SYNC_STATUS.SAVING, { pendingCount: _queue.length + Object.keys(_pending).length });

  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(flush, DEBOUNCE_MS);
}

/* ─── Force flush (used before app close) ───────────────────────── */
export async function flushNow() {
  clearTimeout(_debounceTimer);
  /* Move in-memory pending to queue first */
  for (const [key, value] of Object.entries(_pending)) {
    const err = validate(key, value);
    if (!err) enqueue(key, value);
  }
  _pending = {};

  if (_queue.length === 0) return true;
  await drainQueue();
  return _queue.length === 0 && TC_SYNC.status !== SYNC_STATUS.FAILED;
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
  const headers = { 'X-TC-Client-ID': getClientId() };
  const cfg = (opts && opts.authConfig) || _config || {};
  if (cfg.apiKey) headers['X-TC-KEY'] = cfg.apiKey;

  const res = await fetch(apiUrl + url, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('Server returned HTTP ' + res.status);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Server state load failed');
  return json.data;
}

/* ─── Patch window._tcS.set ─────────────────────────────────────── */
function patchStorageSet() {
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
  _config  = config;
  _pending = {};
  clearTimeout(_debounceTimer);

  /* Expose on window */
  window.TC_SYNC             = TC_SYNC;
  window.TC_SYNC.queuePatch  = queuePatch;
  window.TC_SYNC.flushNow    = flushNow;

  if (!config || config.role === 'standalone') {
    unpatchStorageSet();
    setStatus(SYNC_STATUS.IDLE);
    return;
  }

  /* Load any items that didn't sync before last close */
  await loadQueue();

  /* Patch storage before draining so new writes don't race */
  patchStorageSet();

  /* Drain leftover queue from previous session */
  if (_queue.length > 0) {
    log('info', 'Retrying ' + _queue.length + ' unsynced item(s) from last session');
    await drainQueue();
  } else {
    setStatus(SYNC_STATUS.IDLE);
  }
}

export function destroySyncEngine() {
  clearTimeout(_debounceTimer);
  _debounceTimer = null;
  unpatchStorageSet();
  _config  = null;
  _pending = {};
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
