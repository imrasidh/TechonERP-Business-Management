# TechonERP - Final Root Cause Investigation

**Date:** 2026-07-03  
**Scope:** IndexedDB only  
**Evidence used:** runtime diagnostic error plus current source code and packaging config

---

## Runtime fact

The diagnostic trace stops in this path:

`Customer Save` -> `S.set()` -> `_coreStorageSet()` -> `_idbWrite()` -> `IDBDatabase.transaction()`

Runtime error:

> Failed to execute `transaction` on `IDBDatabase`: One of the specified object stores was not found.

That proves `_idbDB` is not `null`, but the store name passed into `transaction()` does **not** exist in the opened database.

---

## Step 1 - Where the IndexedDB database is opened

### Main app storage open

File: `erp-app/src/App.jsx`

- Database name: `_IDB_NAME = "techon_erp_v1"` at `App.jsx`
- Database version: `1`
- Store constant: `_IDB_STORE = "kv"`

Open path:

- `indexedDB.open(_IDB_NAME, 1)` at `App.jsx`
- `req.onupgradeneeded` at `App.jsx`
- `req.onerror` at `App.jsx`
- `req.onsuccess` at `App.jsx`

Relevant code:

```1457:1495:erp-app/src/App.jsx
      var req = indexedDB.open(_IDB_NAME, 1);
      /* Only bail out if indexedDB.open itself hangs - never resolve while a cursor is still
         filling _idbCache (that used to wipe a concurrent loadStateFromServer hydrate). */
      timeoutId = setTimeout(function () {
        if (!settled && req.readyState !== "done") {
          if (tcIsDevEnv()) try { console.warn("[TechonERP] IDB open hung - merging localStorage fallback and continuing"); } catch (e2) {}
          mergeLocalStorageIntoCache();
          safeResolve();
          scheduleDeferredLocalStorageBackfill();
        }
      }, 12000);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(_IDB_STORE)) {
          db.createObjectStore(_IDB_STORE);
        }
      };
      req.onerror = function () {
        clearTimeout(timeoutId);
        /* IDB unavailable - fall back to reading localStorage into cache */
        // ...
      };
      req.onsuccess = function (e) {
        clearTimeout(timeoutId);
        var db = e.target.result;
        // ...
        _idbDB = db;
        var tx = _idbDB.transaction(_IDB_STORE, "readonly");
```

### SyncEngine queue open

File: `erp-app/src/sync/SyncEngine.js`

- Database name: `IDB_NAME = 'techon_erp_v1'`
- Database version: `1`
- Store constant: `IDB_STORE = 'kv'`

```262:271:erp-app/src/sync/SyncEngine.js
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
```

### LicenseGate read path

File: `erp-app/src/licensing/LicenseGate.jsx`

- Database name: `'techon_erp_v1'`
- Database version: `1`
- Store name: `'kv'`

```1340:1350:erp-app/src/licensing/LicenseGate.jsx
function readIdbKey(key) {
  return new Promise(function(resolve) {
    try {
      var req = indexedDB.open('techon_erp_v1', 1);
      req.onerror = function() { resolve(null); };
      req.onsuccess = function(e) {
        try {
          var db = e.target.result;
          var tx = db.transaction('kv', 'readonly');
          var get = tx.objectStore('kv').get(key);
```

---

## Step 2 - Where object stores are created

Search result: only **two** `createObjectStore()` calls exist in the project, and both create the same store.

### All object stores created in source

| File | Line | Store created |
|---|---:|---|
| `erp-app/src/App.jsx` | `1471` | `_IDB_STORE` -> `"kv"` |
| `erp-app/src/sync/SyncEngine.js` | `268` | `IDB_STORE` -> `'kv'` |

There are **no other object stores** created anywhere in the project.

So the full object-store list proven by source is:

1. `kv`

There is no `queue` store, no `tc3_storage` store, and no second database schema in source.

---

## Step 3 - `_IDB_STORE`

File: `erp-app/src/App.jsx`

```1015:1018:erp-app/src/App.jsx
var _idbCache = {};  /* in-memory cache - S.get reads from here synchronously */
var _idbDB    = null; /* IndexedDB connection, set after initAndLoadIDB() */
var _IDB_NAME  = "techon_erp_v1";
var _IDB_STORE = "kv";
```

### Value

- `_IDB_STORE` = `"kv"`

### Uses in `App.jsx`

| Line | Use |
|---:|---|
| `1032` | `_idbDB.transaction(_IDB_STORE, "readwrite")` |
| `1034` | `tx.objectStore(_IDB_STORE).delete(k)` |
| `1036` | `tx.objectStore(_IDB_STORE).put(v, k)` |
| `1060` | async write transaction |
| `1064` | async delete |
| `1066` | async put |
| `1470-1471` | creation in `onupgradeneeded` |
| `1494-1495` | readonly count |
| `1499-1500` | migration transaction/store |
| `1519-1520` | cursor load transaction/store |

---

## Step 4 - Exact execution trace for the failure

### Customer save path

```1238:1280:erp-app/src/App.jsx
  set: function (k, v) {
    // ...
    if (_custTrace) {
      try { syncTrace("_coreStorageSet()"); } catch (_t) {}
    }
    _coreStorageSet(k, v);
```

```1193:1197:erp-app/src/App.jsx
var _coreStorageSet = function (k, v) {
  _idbCache[k] = v;
  _idbWrite(k, v);
  _mirrorTc3ToLocalStorage(k, v);
};
```

```1024:1036:erp-app/src/App.jsx
var _idbWrite = function (k, v) {
  if (!_idbDB) {
    // ...
    return;
  }
  try {
    var tx = _idbDB.transaction(_IDB_STORE, "readwrite");
    if (v === undefined || v === null) {
      tx.objectStore(_IDB_STORE).delete(k);
    } else {
      tx.objectStore(_IDB_STORE).put(v, k);
    }
```

### Exact values used at the failure point

| Item | Value from source |
|---|---|
| Database object | `_idbDB` |
| Database name | `"techon_erp_v1"` |
| Database version requested | `1` |
| Object store name used in transaction | `"kv"` |
| Object store existence at runtime | **No** - proven by the thrown `transaction("kv")` error |

The runtime error occurs on this exact line:

- `erp-app/src/App.jsx` -> `_idbWrite()` -> line `1032`

That is the first real failure.

---

## Step 5 - Why this runtime error happens

The error happens because the code opens database **`techon_erp_v1` version `1`** and creates store **`kv`** **only** inside `onupgradeneeded`.

If a database named `techon_erp_v1` already exists **at version 1** but does **not** contain object store `kv`, then:

1. `indexedDB.open("techon_erp_v1", 1)` succeeds
2. `onupgradeneeded` does **not** run, because the requested version is still `1`
3. `onsuccess` stores that database in `_idbDB`
4. `_idbWrite()` calls `_idbDB.transaction("kv", "readwrite")`
5. The browser throws: `One of the specified object stores was not found`

This is exactly consistent with the runtime error.

### What the source proves

- Expected DB name is always `techon_erp_v1`
- Expected store is always `kv`
- Expected version is always `1`
- Store creation is gated behind `onupgradeneeded`
- There is **no** version bump
- There is **no** recovery path in `onsuccess` when `_idbDB` exists but lacks `kv`
- There is **no** `deleteDatabase()` anywhere in the project

Therefore the exact root cause is:

**A schema/version mismatch in IndexedDB: the app reuses an existing `techon_erp_v1` database that does not have object store `kv`, but because the open request still uses version `1`, `onupgradeneeded` never runs to create that store.**

This is not a wrong store name in current source. Current source consistently uses:

- DB: `techon_erp_v1`
- store: `kv`

This is not multiple database names in current source either. All three IndexedDB users point to the same DB and store.

---

## Step 6 - Every IndexedDB API use in the entire project

### `indexedDB.open()`

| File | Line | Code |
|---|---:|---|
| `erp-app/src/App.jsx` | `1457` | `indexedDB.open(_IDB_NAME, 1)` |
| `erp-app/src/sync/SyncEngine.js` | `265` | `indexedDB.open(IDB_NAME, 1)` |
| `erp-app/src/licensing/LicenseGate.jsx` | `1343` | `indexedDB.open('techon_erp_v1', 1)` |

### `deleteDatabase()`

No matches in the entire project.

### `createObjectStore()`

| File | Line | Code |
|---|---:|---|
| `erp-app/src/App.jsx` | `1471` | `db.createObjectStore(_IDB_STORE)` |
| `erp-app/src/sync/SyncEngine.js` | `268` | `db.createObjectStore(IDB_STORE)` |

### `transaction()`

| File | Line | Code |
|---|---:|---|
| `erp-app/src/App.jsx` | `1032` | `_idbDB.transaction(_IDB_STORE, "readwrite")` |
| `erp-app/src/App.jsx` | `1060` | `_idbDB.transaction(_IDB_STORE, "readwrite")` |
| `erp-app/src/App.jsx` | `1494` | `_idbDB.transaction(_IDB_STORE, "readonly")` |
| `erp-app/src/App.jsx` | `1499` | `_idbDB.transaction(_IDB_STORE, "readwrite")` |
| `erp-app/src/App.jsx` | `1519` | `_idbDB.transaction(_IDB_STORE, "readonly")` |
| `erp-app/src/sync/SyncEngine.js` | `280` | `db.transaction(IDB_STORE, 'readonly')` |
| `erp-app/src/sync/SyncEngine.js` | `292` | `db.transaction(IDB_STORE, 'readwrite')` |
| `erp-app/src/licensing/LicenseGate.jsx` | `1348` | `db.transaction('kv', 'readonly')` |

### `objectStore()`

| File | Line | Code |
|---|---:|---|
| `erp-app/src/App.jsx` | `1034` | `tx.objectStore(_IDB_STORE).delete(k)` |
| `erp-app/src/App.jsx` | `1036` | `tx.objectStore(_IDB_STORE).put(v, k)` |
| `erp-app/src/App.jsx` | `1064` | `tx.objectStore(_IDB_STORE).delete(k)` |
| `erp-app/src/App.jsx` | `1066` | `tx.objectStore(_IDB_STORE).put(v, k)` |
| `erp-app/src/App.jsx` | `1495` | `tx.objectStore(_IDB_STORE).count()` |
| `erp-app/src/App.jsx` | `1500` | `migTx.objectStore(_IDB_STORE)` |
| `erp-app/src/App.jsx` | `1520` | `loadTx.objectStore(_IDB_STORE).openCursor()` |
| `erp-app/src/sync/SyncEngine.js` | `281` | `tx.objectStore(IDB_STORE).get(key)` |
| `erp-app/src/sync/SyncEngine.js` | `294` | `tx.objectStore(IDB_STORE).delete(key)` |
| `erp-app/src/sync/SyncEngine.js` | `296` | `tx.objectStore(IDB_STORE).put(value, key)` |
| `erp-app/src/licensing/LicenseGate.jsx` | `1349` | `tx.objectStore('kv').get(key)` |

---

## Step 7 - Fresh installation vs existing Counter installation

## Fresh installation

If `techon_erp_v1` does not exist yet:

1. `indexedDB.open("techon_erp_v1", 1)` creates the DB
2. `onupgradeneeded` runs
3. `db.createObjectStore("kv")` runs
4. later `transaction("kv", ...)` works

## Existing Counter installation

If `techon_erp_v1` already exists:

1. the code still calls `indexedDB.open("techon_erp_v1", 1)`
2. if that existing DB is already version `1`, there is no version change
3. `onupgradeneeded` does not run
4. the code assumes `kv` exists and calls `transaction("kv", ...)`
5. if `kv` is missing, the exact runtime error occurs

### Can an older IndexedDB database remain?

Yes, the code path reuses existing Chromium user data.

File: `erp-app/main.cjs`

```42:53:erp-app/main.cjs
try {
  const base = path.join(app.getPath('appData'), 'TechonERP');
  fs.mkdirSync(base, { recursive: true });
  const userDataDir = path.join(base, 'UserData');
  const cacheDir = path.join(base, 'Cache');
  const tempDir = path.join(base, 'Temp');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  app.setPath('userData', userDataDir);
  app.setPath('cache', cacheDir);
  app.setPath('temp', tempDir);
```

That code fixes Electron storage under `%APPDATA%/TechonERP/UserData`.  
The project contains **no** `indexedDB.deleteDatabase()` call and no schema reset code.

So source code proves:

- runtime storage is persisted under Electron user data
- reinstall packaging does not include code that clears IndexedDB
- existing IndexedDB can be reopened unchanged by `indexedDB.open("techon_erp_v1", 1)`

### How upgrades are handled

They are handled **only** by:

- `indexedDB.open(name, version)`
- `onupgradeneeded`

In this code, the version is still hard-coded to `1`, so there is no schema upgrade path beyond version `1`.

---

## Step 8 - Production Electron build vs current workspace source

Packaging config:

```59:66:erp-app/package.json
    "files": [
      "dist/**/*",
      "main.cjs",
      "preload.js",
      "icons/**/*",
      "splash.html",
      "splash.png",
      "tc_license_secret.txt.example"
    ],
```

The packaged Electron build uses:

- current `main.cjs`
- current `preload.js`
- current renderer bundle from `dist/**/*`

Current source and current packaging config both point to the same IndexedDB schema:

- DB name: `techon_erp_v1`
- version: `1`
- object store: `kv`

No alternate production DB name, version, or store exists in source.

---

## Step 9 - Exact code responsible

### Primary root-cause code

File: `erp-app/src/App.jsx`  
Function: `initAndLoadIDB()`  
Lines: `1457-1473`

Reason:

- opens DB `techon_erp_v1` at version `1`
- creates `kv` only in `onupgradeneeded`
- does not force any upgrade when an existing version-1 DB lacks `kv`

### Failure line

File: `erp-app/src/App.jsx`  
Function: `_idbWrite()`  
Line: `1032`

Reason:

- immediately assumes `_IDB_STORE` (`"kv"`) exists in `_idbDB`
- runtime proves that assumption is false on Counter

### Same schema assumption exists elsewhere

File: `erp-app/src/sync/SyncEngine.js`  
Function: `getIDB()`  
Lines: `265-268`

Reason:

- also opens version `1`
- also creates `kv` only in `onupgradeneeded`

File: `erp-app/src/licensing/LicenseGate.jsx`  
Function: `readIdbKey()`  
Lines: `1343-1349`

Reason:

- directly reads `techon_erp_v1` / `kv`

---

## Final answer

### 1. Exact root cause

**The Counter is opening an existing IndexedDB database named `techon_erp_v1` that does not contain object store `kv`, while the code still opens that database at version `1`. Because the version does not increase, `onupgradeneeded` does not run, so `kv` is never created. `_idbWrite()` then fails on `_idbDB.transaction("kv", "readwrite")`.**

### 2. Exact file

Primary schema code: `erp-app/src/App.jsx`

### 3. Exact function

- `initAndLoadIDB()`
- failure occurs later in `_idbWrite()`

### 4. Exact lines

- Schema open / creation path: `App.jsx:1457-1473`
- Failure line: `App.jsx:1032`
- Store definition: `App.jsx:1017-1018`

### 5. Why the object store does not exist

Because the code creates `kv` only during `onupgradeneeded`, but the database is still opened as version `1`. If an existing `techon_erp_v1` database at version `1` is already present and lacks `kv`, the upgrade handler never runs, so the store remains missing.

### 6. What kind of fix is required

From the source code and runtime error, this requires a **schema/version correction**, specifically one of these concrete IndexedDB-layer actions:

- **creating the missing object store through an IndexedDB upgrade path**
- or **deleting/recreating the local IndexedDB**

It is **not** a wrong current object-store name in source, and it is **not** an HTTP / IPC / PHP / MySQL issue.
