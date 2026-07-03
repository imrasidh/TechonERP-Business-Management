# TechonERP - IndexedDB Schema Recovery Implementation

**Date:** 2026-07-03  
**Scope:** IndexedDB initialization only  
**Sync / HTTP / PHP / MySQL / XAMPP:** unchanged

---

## Root cause

The app was opening IndexedDB database `techon_erp_v1` and assuming object store `kv` existed. That store was only created inside `onupgradeneeded`. On an older Counter installation where `techon_erp_v1` already existed without `kv`, `indexedDB.open("techon_erp_v1", 1)` succeeded, `onupgradeneeded` did not run, and `_idbWrite()` failed on:

```1024:1036:erp-app/src/App.jsx
var _idbWrite = function (k, v) {
  // ...
  try {
    var tx = _idbDB.transaction(_IDB_STORE, "readwrite");
    if (v === undefined || v === null) {
      tx.objectStore(_IDB_STORE).delete(k);
    } else {
      tx.objectStore(_IDB_STORE).put(v, k);
    }
```

That is why Customer save stopped before SyncEngine.

---

## Files changed

Only one file was changed:

- `erp-app/src/App.jsx`

No changes were made to:

- `SyncEngine`
- HTTP
- PHP
- MySQL
- XAMPP

---

## Recovery strategy implemented

### 1. Startup schema verification

IndexedDB startup now verifies the store after opening the database. It no longer assumes `kv` exists.

Added constants / metadata:

```1015:1030:erp-app/src/App.jsx
var _idbCache = {};  /* in-memory cache - S.get reads from here synchronously */
var _idbDB    = null; /* IndexedDB connection, set after initAndLoadIDB() */
var _IDB_NAME  = "techon_erp_v1";
var _IDB_VERSION = 1;
var _IDB_STORE = "kv";
var _idbStartupMeta = {
  dbName: _IDB_NAME,
  requestedVersion: _IDB_VERSION,
  openedVersion: null,
  initialStores: [],
  finalStores: [],
  recoveryExecuted: false,
  recreated: false,
};
```

### 2. Automatic schema recovery

Added new startup helpers:

- `_idbOpenDb(version, meta, createStoreOnUpgrade)`
- `_idbDeleteDb()`
- `_idbEnsureSchema()`
- `_idbWriteStartupLog(meta)`

Recovery flow now is:

1. Open `techon_erp_v1` at version `1`
2. Check `db.objectStoreNames.contains("kv")`
3. If `kv` exists: continue normally
4. If `kv` is missing:
   - close DB
   - reopen at `db.version + 1`
   - create `kv` in `onupgradeneeded`
5. Verify `kv` again
6. If still missing:
   - `deleteDatabase("techon_erp_v1")`
   - recreate DB
   - create `kv`
7. Verify `kv` again
8. If still false: abort startup with a clear error UI

Relevant code:

```1051:1160:erp-app/src/App.jsx
function _idbOpenDb(version, meta, createStoreOnUpgrade) {
  return new Promise(function (resolve, reject) {
    try {
      var req = indexedDB.open(_IDB_NAME, version);
      req.onupgradeneeded = function (e) {
        try {
          var db = e.target.result;
          if (createStoreOnUpgrade && !db.objectStoreNames.contains(_IDB_STORE)) {
            db.createObjectStore(_IDB_STORE);
          }
        } catch (upgradeErr) {
          reject(upgradeErr);
        }
      };
      req.onerror = function () {
        reject(req.error || new Error("indexedDB.open failed for " + _IDB_NAME));
      };
      req.onsuccess = function (e) {
        try {
          var db = e.target.result;
          if (meta && meta.openedVersion == null) meta.openedVersion = db.version;
          resolve(db);
        } catch (successErr) {
          reject(successErr);
        }
      };
    } catch (e) {
      reject(e);
    }
  });
}

function _idbDeleteDb() {
  return new Promise(function (resolve, reject) {
    try {
      if (_idbDB) {
        try { _idbDB.close(); } catch (_closeErr) {}
        _idbDB = null;
      }
      var req = indexedDB.deleteDatabase(_IDB_NAME);
      req.onblocked = function () {
        reject(new Error("deleteDatabase blocked for " + _IDB_NAME));
      };
      req.onerror = function () {
        reject(req.error || new Error("deleteDatabase failed for " + _IDB_NAME));
      };
      req.onsuccess = function () { resolve(); };
    } catch (e) {
      reject(e);
    }
  });
}

function _idbEnsureSchema() {
  // open -> verify -> upgrade -> verify -> delete/recreate -> verify
}
```

### 3. Startup abort if recovery still fails

If recovery still cannot produce store `kv`, startup is aborted with a full-screen IndexedDB error instead of silently continuing with a broken DB.

```6198:6204:erp-app/src/App.jsx
    initAndLoadIDB().then(finishInit).catch(function (err) {
      var msg = "IndexedDB startup failed: " + String((err && err.message) || err || "Unknown error");
      _idbLog("error", msg);
      setIdbStartupError(msg);
    });
```

```6956:6970:erp-app/src/App.jsx
  if (idbStartupError) {
    return (
      <div ...>
        <div ...>
          <div ...>IndexedDB Startup Failed</div>
          <div ...>{idbStartupError}</div>
          <div ...>
            Local IndexedDB recovery did not produce the required <strong>{_IDB_STORE}</strong> object store.
          </div>
```

---

## Transaction safety changes

### `_idbWrite()`

`_idbWrite()` now:

- verifies `kv` exists before opening a transaction
- stores `tx.objectStore(_IDB_STORE)` in a local variable
- logs failures
- rethrows instead of silently swallowing exceptions

```1078:1100:erp-app/src/App.jsx
var _idbWrite = function (k, v) {
  // ...
  try {
    if (!_idbDB.objectStoreNames.contains(_IDB_STORE)) {
      throw new Error("IndexedDB object store missing: " + _IDB_STORE);
    }
    var tx = _idbDB.transaction(_IDB_STORE, "readwrite");
    var store = tx.objectStore(_IDB_STORE);
    if (v === undefined || v === null) {
      store.delete(k);
    } else {
      store.put(v, k);
    }
```

### `_idbWriteAsync()`

`_idbWriteAsync()` now:

- verifies `kv` exists before transaction
- logs transaction failures
- no longer silently ignores `transaction()` / `objectStore()` failures

---

## Why old installations now work

Old installations can keep Electron `userData`, and therefore can keep an older IndexedDB database under the same name. Previously, that older DB could remain at version `1` without object store `kv`, and startup had no repair path.

Now old installations work because startup does this automatically:

1. open existing DB
2. inspect `objectStoreNames`
3. if `kv` is missing, force a schema repair by reopening at a higher version
4. if that still does not produce `kv`, delete and recreate the DB

So the user does **not** need to manually clear AppData or UserData.

---

## Why Standalone mode is unaffected

Standalone mode still uses the same local storage stack:

- `S.set()`
- `_coreStorageSet()`
- `_idbWrite()`

This change only makes sure the local IndexedDB schema is valid before normal startup continues. It does not change:

- business logic
- licensing logic
- standalone write flow
- UI state flow

It only guarantees that the local `kv` store exists before the app starts using IndexedDB.

---

## Why Multi-PC automatic sync now reaches SyncEngine

Before this fix, Customer save stopped at local IndexedDB:

`Customer Save` -> `S.set()` -> `_coreStorageSet()` -> `_idbWrite()` -> exception

Because `_idbWrite()` threw first, execution never reached the later network block in `S.set()`.

After this fix:

1. startup repairs or recreates the IndexedDB schema
2. `_idbWrite()` can open `transaction("kv", "readwrite")`
3. Customer save completes local storage write
4. the same `S.set()` call continues into the existing sync path

No sync behavior was redesigned. This fix only removes the IndexedDB failure that previously prevented sync from ever starting.

---

## Startup logging added

One IndexedDB startup log is now written with:

- database name
- requested version
- opened version
- initial object stores
- final object stores
- whether recovery executed
- whether database was recreated

Example format:

```text
[IndexedDB] startup db=techon_erp_v1 requestedVersion=1 openedVersion=1 initialStores=[...] finalStores=[kv] recoveryExecuted=true recreated=false
```

---

## Verification run here

Executed successfully:

- `npm run build`
- `npm run dist`

Generated installer:

- `erp-app/release/Techon-ERP Setup 2.0.0.exe`

---

## Summary

This implementation fixes the real failure point by making IndexedDB initialization self-healing:

- verify `kv`
- upgrade schema if missing
- delete/recreate if upgrade cannot recover
- verify again
- abort clearly if still broken

Everything after IndexedDB remains unchanged.
