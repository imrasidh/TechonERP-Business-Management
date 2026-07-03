# FINAL DEBUG SESSION — Source Code Execution Trace

**Date:** 2026-07-03  
**Scope:** `erp-app/src` (current workspace source)  
**Method:** Static trace only. No code changes. No fixes. No runtime Counter capture in this session.

---

## STEP 1 — Customer Save Button → Full Call Chain

### Save button bindings (`Customers.jsx`)

| UI | Handler | Line |
|---|---|---|
| `+ Add Customer` modal **Save** | `onClick={saveNew}` | 106 |
| Edit modal **Save Changes** | `onClick={saveEditCust}` | 116 |

### `saveNew()` chain (new customer, no duplicate-phone confirm)

```
Customers.jsx:106  Btn onClick
  ↓
Customers.jsx:42   saveNew()
  ↓ (guard: !f.name → return)
Customers.jsx:55–56  build customer object `c`, build array `nc = state.customers.concat([c])`
  ↓
Customers.jsx:57   S.set("tc3_customers", nc)
  ↓
App.jsx:1220       S.set(k, v)          [S is props.S — same object as window._tcS, App.jsx:1326]
  ↓
App.jsx:1223       evaluateLicenseStorageWrite(k, v, oldV)
  ↓ (if licBlock.blocked → return at 1228 — chain stops)
App.jsx:1230       validateAccountingMutation(k, v, oldV)
  ↓ (if !vr.ok → return at 1246 — chain stops)
App.jsx:1249       _coreStorageSet(k, v)
  ↓
App.jsx:1177       _idbCache[k] = v
App.jsx:1178       _idbWrite(k, v)
  ↓
App.jsx:1026       _idbDB.transaction(_IDB_STORE, "readwrite")
App.jsx:1030       tx.objectStore(_IDB_STORE).put(v, k)    ← IndexedDB write
  ↓
App.jsx:1179       _mirrorTc3ToLocalStorage(k, v)
  ↓
App.jsx:1064       localStorage.setItem(k, JSON.stringify(v))
  ↓
App.jsx:1255–1268  network sync block (see STEP 3)
  ↓
Customers.jsx:58   setState({ customers: nc })
Customers.jsx:59   setShow(false); setF(...)
```

### `saveNew()` chain (duplicate-phone confirm path)

```
Customers.jsx:45   showConfirm(..., callback)
  ↓
Customers.jsx:47   tcTrialGuard(state.customers, 'customers')  (may return)
Customers.jsx:49   S.set("tc3_customers", nc)
  ↓
(same S.set chain as above)
```

### `saveEditCust()` chain

```
Customers.jsx:116  Btn onClick
  ↓
Customers.jsx:62   saveEditCust()
  ↓
Customers.jsx:67   S.set("tc3_customers", nc)
  ↓
(same S.set chain as above)
```

### Post-save secondary write (same session, async)

After `setState`, React re-renders and this effect runs:

```
App.jsx:6815       useEffect (loggedIn && state && idbReady)
  ↓
App.jsx:6819       _coreStorageSet("tc3_customers", state.customers)
  ↓
App.jsx:1177–1179  _idbCache → _idbWrite → _mirrorTc3ToLocalStorage
  ↓
(does NOT call syncStorageKey — comment at App.jsx:6812–6814)
```

---

## STEP 2 — Exact Function That Writes `tc3_customers` to Storage

### Primary write on Customer Save (first write)

| Step | Function | File:Line | Storage operation |
|---|---|---|---|
| 1 | `S.set("tc3_customers", nc)` | Customers.jsx:49,57,67 | entry |
| 2 | `_coreStorageSet(k, v)` | App.jsx:1249 → 1176 | orchestrates write |
| 3 | `_idbCache[k] = v` | App.jsx:1177 | in-memory cache |
| 4 | `_idbWrite(k, v)` | App.jsx:1178 → 1023 | IndexedDB |
| 5 | `tx.objectStore(_IDB_STORE).put(v, k)` | App.jsx:1030 | **final IndexedDB put** |
| 6 | `_mirrorTc3ToLocalStorage(k, v)` | App.jsx:1179 → 1057 | `localStorage.setItem` |

**Answer:** Customer Save does **not** call `appendStorageRecord()`, `idbSet()` (SyncEngine), or `window._tcS.set` as a separate object. It calls **`S.set()`**, which calls **`_coreStorageSet()`**, which calls **`_idbWrite()`**, which calls **`IndexedDB objectStore.put()`**.

`S` and `window._tcS` are the **same object** (`App.jsx:1326`).

### Secondary write (mirror effect, after setState)

| Step | Function | File:Line |
|---|---|---|
| 1 | `_coreStorageSet("tc3_customers", state.customers)` | App.jsx:6819 |
| 2 | `_idbWrite` → `objectStore.put` | App.jsx:1178 → 1030 |

### Pull / server-merge write (not Customer Save path)

| Step | Function | File:Line |
|---|---|---|
| 1 | `_writeMergedServerStateToCache(merged)` | App.jsx:1071 |
| 2 | `_idbWrite(k, v)` per key | App.jsx:1076 |

Call sites: App.jsx:6184, 6271, 6312, 6926.

---

## STEP 3 — Does Customer Save Execute `syncStorageKey()`?

### Answer

**YES** — the Customer save source path **contains and invokes** `syncStorageKey()` when all of the following are true at runtime:

1. `S.set` does not `return` early (license block at 1228, accounting block at 1246).
2. `window._tcNetRole === "network_server"` **OR** `window._tcNetRole === "network_client"` (App.jsx:1256).
3. `window.TC_SYNC.syncStorageKey` is a function (App.jsx:1264–1265).

**NO** — if any of the above is false, `syncStorageKey()` is **not** called from Customer save.

### Exact stack when YES

```
Customers.jsx:57 (or :49, :67)
  S.set("tc3_customers", nc)
    ↓
App.jsx:1262
  ensureSyncConfig(window._tcSystemConfig)
    ↓
App.jsx:1265
  window.TC_SYNC.syncStorageKey(k, v)
    ↓
SyncEngine.js:654
  syncStorageKey(key, optValue)
    ↓ (debounced setTimeout)
SyncEngine.js:687
  syncStorageKeyNow(key, pushVal)
    ↓
SyncEngine.js:621
  sendBatch([{ key, value }])
    ↓
SyncEngine.js:485
  postSyncPatch({ patches, client_id })
```

### Exact bypass reasons when NO

| Condition | Location | Effect |
|---|---|---|
| `evaluateLicenseStorageWrite` blocks | App.jsx:1224–1228 | `S.set` returns before `_coreStorageSet` and before sync block |
| `validateAccountingMutation` fails | App.jsx:1231–1246 | same |
| `window._tcNetRole` not `network_server` / `network_client` | App.jsx:1256 | entire sync block skipped |
| `window.TC_SYNC.syncStorageKey` missing | App.jsx:1264 | falls through to `queuePatch` at 1266–1267 if that exists; otherwise no sync call |
| `syncStorageKey` returns at `!SYNC_KEY_SET[key]` | SyncEngine.js:655 | `tc3_customers` **is** in `SYNC_KEY_SET` (SyncEngine.js:180) — not a bypass for customers |
| `syncStorageKey` returns at validate error | SyncEngine.js:661–662 | stops before `syncStorageKeyNow` |
| `getActiveConfig()` null at debounce fire | SyncEngine.js:668–674 | schedules `ensureSyncConfigFromDisk` retry; may not reach HTTP |

Customer save does **not** bypass `syncStorageKey` via `appendStorageRecord` — that function is never called for `tc3_customers` anywhere in `src/`.

---

## STEP 4 — Every Writer of Sync Keys

### `tc3_customers`

| Writer | File | Lines | Mechanism |
|---|---|---|---|
| `S.set("tc3_customers", …)` | Customers.jsx | 49, 57, 67 | S.set |
| `S.set("tc3_customers", …)` | Sales.jsx | 541, 894 | S.set |
| `S.set("tc3_customers", …)` | Invoices.jsx | 62, 695, 813, 860 | S.set |
| `S.set("tc3_customers", …)` | Repairs.jsx | 69 | S.set |
| `S.set("tc3_customers", …)` | Returns.jsx | 326 | S.set |
| `S.set("tc3_customers", …)` | Receivables.jsx | 97, 164 | S.set |
| `S.set("tc3_customers", …)` | Cheques.jsx | 146 | S.set |
| `_coreStorageSet("tc3_customers", …)` | App.jsx | 6819 | mirror useEffect |
| `_writeMergedServerStateToCache` | App.jsx | 1071–1077 | pull/merge |

### `tc3_products`

| Writer | File | Mechanism |
|---|---|---|
| `S.set` | Settings.jsx:797 | S.set |
| `S.set` | Purchases.jsx:887,949,1130,1211 | S.set |
| `S.set` | Returns.jsx:324,721 | S.set |
| `S.set` | Inventory.jsx:404,527,598,624,636,647,653 | S.set |
| `S.set` | Invoices.jsx:694 | S.set |
| `S.set` | Sales.jsx:893 | S.set |
| `S.set` | Accounts.jsx:287 | S.set |
| `_coreStorageSet` | App.jsx:6818 | mirror |
| `_writeMergedServerStateToCache` | App.jsx:1071 | pull/merge |

### `tc3_sales`

| Writer | File | Mechanism |
|---|---|---|
| `S.set` | Receivables.jsx:97,164,206 | S.set |
| `S.set` | Returns.jsx:325 | S.set |
| `S.set` | Invoices.jsx:696,757,786,813,860 | S.set |
| `S.set` | Cheques.jsx:146 | S.set |
| `S.set` | Sales.jsx:896,900,902 | S.set |
| `S.appendRecord("tc3_sales", …)` | Sales.jsx:899 | S.appendRecord → S.set |
| `_coreStorageSet` | App.jsx:6821 | mirror |
| `_writeMergedServerStateToCache` | App.jsx:1071 | pull/merge |

### `tc3_suppliers`

| Writer | File | Mechanism |
|---|---|---|
| `S.set` | Suppliers.jsx:55,63,71 | S.set |
| `S.set` | Purchases.jsx:304 | S.set |
| `_coreStorageSet` | App.jsx:6820 | mirror |
| `_writeMergedServerStateToCache` | App.jsx:1071 | pull/merge |

### `tc3_purchases`

| Writer | File | Mechanism |
|---|---|---|
| `S.set` | Purchases.jsx:887,910,950,1159 | S.set |
| `S.set` | Returns.jsx:722 | S.set |
| `S.set` | Payables.jsx:123,150,189 | S.set |
| `S.set` | Cheques.jsx:146 | S.set |
| `_coreStorageSet` | App.jsx:6822 | mirror |
| `_writeMergedServerStateToCache` | App.jsx:1071 | pull/merge |

### `tc3_expenses`

| Writer | File | Mechanism |
|---|---|---|
| `S.set` | Expenses.jsx:68,75 | S.set |
| `_coreStorageSet` | App.jsx:6825 | mirror |
| `_writeMergedServerStateToCache` | App.jsx:1071 | pull/merge |

### `tc3_quotations`

| Writer | File | Mechanism |
|---|---|---|
| `S.set` | Invoices.jsx:331,351,363,372 | S.set |
| `S.set` | Sales.jsx:905,1355 | S.set |
| `_coreStorageSet` | App.jsx:6833 | mirror |
| `_writeMergedServerStateToCache` | App.jsx:1071 | pull/merge |

### `tc3_repairs`

| Writer | File | Mechanism |
|---|---|---|
| `S.set` | Repairs.jsx:89,99,115 | S.set |
| `S.set` | Sales.jsx:904 | S.set |
| `_coreStorageSet` | App.jsx:6826 | mirror |
| `_writeMergedServerStateToCache` | App.jsx:1071 | pull/merge |

### Other IndexedDB helpers (not used for Customer Save primary path)

| Function | File | Writes sync keys? |
|---|---|---|
| `idbSet()` | SyncEngine.js:280 | **NO** — only `QUEUE_IDB_KEY` (line 303) |
| `appendStorageRecord()` | SyncEngine.js:934 | **NO callers** for any sync key in `src/` |
| `S.appendRecord()` | App.jsx:1316 | only `tc3_sales` (Sales.jsx:899) |

---

## STEP 5 — Does Each Writer Eventually Call `syncStorageKey()`?

| Writer | Calls `syncStorageKey()`? |
|---|---|
| `S.set(…)` (all pages) | **YES** — when `window._tcNetRole` is `network_server` or `network_client` and sync block runs (App.jsx:1265) |
| `S.appendRecord(…)` → `S.set` | **YES** — same as `S.set` |
| `_coreStorageSet` in mirror useEffect (App.jsx:6815–6834) | **NO** — by design (comment 6812–6814) |
| `_writeMergedServerStateToCache` (pull/merge) | **NO** |
| `pushKeysToServer` (manual Upload) | **NO** — calls `sendBatch` directly, not `syncStorageKey` (SyncEngine.js:755–774) |

---

## STEP 6 — All References

### `window._tcS`

| File | Line | Usage |
|---|---|---|
| App.jsx | 1326 | `window._tcS = S` |
| SyncEngine.js | 809 | `window._tcS.__synced = false` |
| SyncEngine.js | 813 | `if (!window._tcS)` |
| SyncEngine.js | 822 | `if (window._tcS.__synced) return` |
| SyncEngine.js | 824–825 | bind/patch `window._tcS.set` |
| SyncEngine.js | 829 | `window._tcS.__synced = true` |
| SyncEngine.js | 838–842 | unpatch |
| SyncEngine.js | 935–936 | `appendStorageRecord` delegates to `window._tcS.appendRecord` |

### `S.set` (definition + all call sites)

**Definition:** App.jsx:1220–1269 (`S` object).

**Exported alias:** `window._tcS.set` is the same function unless `patchStorageSet()` replaces it (see below).

**Page/module callers (representative sync keys):**

- Customers.jsx: 49, 57, 67
- Sales.jsx: 541, 893–906, 899 (`appendRecord` → `S.set`)
- Invoices.jsx, Repairs.jsx, Returns.jsx, Receivables.jsx, Cheques.jsx, Expenses.jsx, Suppliers.jsx, Purchases.jsx, Inventory.jsx, Settings.jsx, Accounts.jsx, Payables.jsx, App.jsx (30 calls), financialSnapshot.js, etc.

### `appendStorageRecord`

| File | Line |
|---|---|
| SyncEngine.js | 934 (definition) |
| SyncEngine.js | 936 (calls `window._tcS.appendRecord`) |

**No page imports or calls `appendStorageRecord` for business data.**

### `queuePatch`

| File | Line | Role |
|---|---|---|
| SyncEngine.js | 711 | definition |
| SyncEngine.js | 717 | calls `syncStorageKey(key)` |
| SyncEngine.js | 827 | `patchStorageSet` wrapper after `_origSset` |
| SyncEngine.js | 853 | exposed on `window.TC_SYNC` |
| SyncEngine.js | 950 | `TC_SYNC.queuePatch = queuePatch` |
| App.jsx | 1266–1267 | fallback if `syncStorageKey` missing |

### `syncStorageKey`

| File | Line | Role |
|---|---|---|
| SyncEngine.js | 654 | definition |
| SyncEngine.js | 197 | `_maybeScheduleDeferredFlush` |
| SyncEngine.js | 672 | retry after `ensureSyncConfigFromDisk` |
| SyncEngine.js | 717 | via `queuePatch` |
| SyncEngine.js | 955 | `TC_SYNC.syncStorageKey = syncStorageKey` |
| App.jsx | 1264–1265 | **primary hook inside `S.set`** |

### `syncStorageKeyNow`

| File | Line | Role |
|---|---|---|
| SyncEngine.js | 589 | definition |
| SyncEngine.js | 647 | retry after inflight |
| SyncEngine.js | 687 | called from debounced `syncStorageKey` |
| SyncEngine.js | 705 | `flushAllPendingKeys` |
| SyncEngine.js | 956 | `TC_SYNC.syncStorageKeyNow = syncStorageKeyNow` |

---

## STEP 7 — `syncStorageKey()` Callers and Customer Module

### Where `syncStorageKey()` is called (source)

| # | Caller | File:Line | Reaches `syncStorageKey` via |
|---|---|---|---|
| 1 | `S.set` network block | **App.jsx:1265** | direct `window.TC_SYNC.syncStorageKey(k, v)` |
| 2 | `queuePatch` | SyncEngine.js:717 | `syncStorageKey(key)` |
| 3 | `_maybeScheduleDeferredFlush` | SyncEngine.js:197 | `syncStorageKey(k)` |
| 4 | `ensureSyncConfigFromDisk` callback | SyncEngine.js:672 | `syncStorageKey(key, …)` |
| 5 | `patchStorageSet` wrapper | SyncEngine.js:825–827 | `_origSset` then `queuePatch` → `syncStorageKey` |

**Direct callers of `syncStorageKey` function: 4 code paths (rows 1–4).**  
Row 5 is inactive when `window.__TC_SYNC_DIRECT__ === true` (SyncEngine.js:808–811).

### `patchStorageSet` vs direct hook

`initSyncEngine` → `ensureSyncConfig` sets `window.__TC_SYNC_DIRECT__ = true` → `patchStorageSet()` **returns without wrapping** `window._tcS.set` (SyncEngine.js:807–811).

Therefore automatic sync for `S.set` relies on the **explicit call inside `S.set`** at App.jsx:1264–1265, not the wrapper.

### Which caller Customer module uses

```
Customers.jsx receives props.S (App.jsx:4616)
  ↓
props.S === S === window._tcS (App.jsx:1326)
  ↓
Customers.jsx:57  S.set("tc3_customers", nc)
  ↓
App.jsx:1265  window.TC_SYNC.syncStorageKey(k, v)   ← Customer module caller
```

Customer module uses **caller #1 only** (`App.jsx:1265`).

### Modified code locations (from prior fix session) — execution path

| Modified symbol | File | Invoked from Customer save? |
|---|---|---|
| `S.set` sync block (1262–1268) | App.jsx | **YES** — every `S.set` including Customer |
| `ensureSyncConfig` | SyncEngine.js | **YES** — App.jsx:1262 |
| `syncStorageKey` / `syncStorageKeyNow` | SyncEngine.js | **YES** — via App.jsx:1265 |
| `ensureSyncConfigFromDisk` | SyncEngine.js | **YES** — if `getActiveConfig()` null inside `syncStorageKey` |
| `postSyncPatch` IPC+fetch fallback | SyncEngine.js | **YES** — via `syncStorageKeyNow` → `sendBatch` |
| `patchStorageSet` wrapper | SyncEngine.js | **NO** — skipped when `__TC_SYNC_DIRECT__` |

**Note:** Whether the Counter PC runs this source depends on which build is installed (`erp-app/release/` vs older `.exe`). This report traces **workspace source only**.

---

## STEP 8 — Real Runtime Path (Source-Proven)

### Customer Save → Storage → Sync attempt

```
[UI] Customers.jsx:106  Btn onClick → saveNew
  ↓
[Module] Customers.jsx:57  S.set("tc3_customers", nc)
  ↓
[Storage API] App.jsx:1220  S.set
  ↓
[Gate] App.jsx:1223–1247  license + accounting (may STOP)
  ↓
[Write] App.jsx:1249  _coreStorageSet
  ↓
[Cache] App.jsx:1177  _idbCache["tc3_customers"] = nc
  ↓
[IDB] App.jsx:1178→1023  _idbWrite
  ↓
[IDB] App.jsx:1030  objectStore.put(nc, "tc3_customers")
  ↓
[LS] App.jsx:1179→1064  localStorage.setItem("tc3_customers", …)
  ↓
[Gate] App.jsx:1256  window._tcNetRole === network_server|network_client? (may SKIP sync)
  ↓
[Sync init] App.jsx:1262  ensureSyncConfig(window._tcSystemConfig)
  ↓
[Sync queue] App.jsx:1265  window.TC_SYNC.syncStorageKey("tc3_customers", nc)
  ↓
[Debounce] SyncEngine.js:682–687  setTimeout → syncStorageKeyNow
  ↓
[HTTP] SyncEngine.js:621  sendBatch → postSyncPatch → electronAPI.syncPatch / fetch
  ↓
[Main] main.cjs  tc-sync-patch IPC → lanPost → POST sync_patch.php
  ↓
[UI state] Customers.jsx:58  setState({ customers: nc })
  ↓
[Mirror - NO SYNC] App.jsx:6819  _coreStorageSet("tc3_customers", state.customers)
  ↓
END
```

### Manual Upload Shop Data path (works per user report — for contrast)

```
Settings.jsx:3485  pushKeysToServer(NETWORK_KV_KEYS, { authConfig: systemConfig })
  ↓
SyncEngine.js:755  pushKeysToServer
  ↓
SyncEngine.js:774  sendBatch(patches)   ← does NOT go through syncStorageKey
  ↓
postSyncPatch → HTTP
```

---

## FINAL ANSWER (one conclusion)

**From current workspace source code: Customer save does NOT bypass automatic sync. It calls `S.set("tc3_customers", nc)`, and `S.set` explicitly calls `window.TC_SYNC.syncStorageKey(k, v)` when `window._tcNetRole` is `"network_server"` or `"network_client"`. Storage is written via `_coreStorageSet` → `_idbWrite` → `IndexedDB objectStore.put`, not via `appendStorageRecord`. A later mirror `_coreStorageSet` in `App.jsx:6819` re-writes the same key without calling `syncStorageKey`, but that runs after the primary `S.set` path has already invoked `syncStorageKey`.**

If automatic sync still fails on Counter while manual Upload works, **this source trace shows the failure is not because Customer save skips `syncStorageKey` on the primary save path** (assuming Counter runs this source and `window._tcNetRole` is `network_client`). The divergence between working manual upload (`pushKeysToServer` → `sendBatch`) and automatic save (`syncStorageKey` → debounce → `syncStorageKeyNow` → `sendBatch`) occurs **after** `syncStorageKey` is invoked — at config gates inside `syncStorageKey`/`syncStorageKeyNow`, debounce timing, or HTTP/IPC delivery — which requires Counter runtime logs to locate precisely. **No Counter runtime capture was performed in this session.**

---

## Evidence Files

| File | Relevance |
|---|---|
| `erp-app/src/pages/Customers.jsx` | Save handlers |
| `erp-app/src/App.jsx` | `S.set`, `_coreStorageSet`, `_idbWrite`, mirror effect |
| `erp-app/src/sync/SyncEngine.js` | `syncStorageKey`, `syncStorageKeyNow`, `pushKeysToServer`, `patchStorageSet` |
| `erp-app/main.cjs` | `tc-sync-patch` IPC handler |
| `docs/TECHONERP-SYNC-RUNTIME-INVESTIGATION.md` | Prior Apache evidence: zero POST from Counter IP |
