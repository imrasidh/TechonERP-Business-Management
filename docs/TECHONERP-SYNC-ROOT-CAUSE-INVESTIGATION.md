# TechonERP Multi-PC Sync — Root Cause Investigation (Code Trace Only)

> **No files were modified.** This report is based only on reading the current source code in `erp-app/`.  
> Investigation date: July 2026

---

## Table of Contents

1. [Step 1 — Counter PC creates ONE customer (full trace)](#step-1--counter-pc-creates-one-customer-full-trace)
2. [Step 2 — Status at each step](#step-2--status-at-each-step)
3. [Step 3 — Main PC poll trace (every 2.5 s)](#step-3--main-pc-poll-trace-every-25-s)
4. [Step 4 — Every place sync can stop](#step-4--every-place-sync-can-stop)
5. [Step 5 — Proof chain for S.set on syncable keys](#step-5--proof-chain-for-sset-on-syncable-keys)
6. [Step 6 — Automatic sync vs Upload Shop Data](#step-6--automatic-sync-vs-upload-shop-data)
7. [Step 7 — MySQL after counter saves one customer](#step-7--mysql-after-counter-saves-one-customer)
8. [Step 8 — Delete quotation reappear (~2–3 s)](#step-8--delete-quotation-reappear-23-s)
9. [Final Report — Root causes](#final-report--root-causes)
10. [Minimum runtime proof (no code changes)](#minimum-runtime-proof-no-code-changes)

---

## STEP 1 — Counter PC creates ONE customer (full trace)

### UI → local storage

```
Customers.jsx  saveNew() / save path
  ↓
  state.customers.concat([c])  →  nc
  ↓
S.set("tc3_customers", nc)                    [App.jsx ~1220]
  ↓
evaluateLicenseStorageWrite()                 [trialLimits.js ~132] — if blocked → STOP (return before sync)
  ↓
validateAccountingMutation()                  [App.jsx ~1230] — if !ok → STOP
  ↓
_coreStorageSet(k, v)                         [App.jsx ~1176]
  → _idbCache[k] = v
  → _idbWrite(k, v)                           (IndexedDB async)
  → _mirrorTc3ToLocalStorage(k, v)
  ↓
if window._tcNetRole === 'network_server' || 'network_client'  [App.jsx ~1255-1256]
  → window._tcRecentLocalWrites[k] = Date.now()
  → window.TC_SYNC.syncStorageKey(k, v)       [SyncEngine.js ~556]
  ↓
setState({ customers: nc })                   [Customers.jsx ~58]
  ↓
React mirror useEffect                        [App.jsx ~6809]
  → _coreStorageSet("tc3_customers", state.customers)  (NO sync call — by design)
```

### Automatic push path

```
syncStorageKey(key, optValue)                 [SyncEngine.js ~556]
  ↓ guards: getActiveConfig(), role !== standalone, apiUrl, SYNC_KEY_SET, validate()
  ↓ _pending[key] = value; setTimeout 100ms (RECORD_DEBOUNCE_MS)
  ↓
syncStorageKeyNow(key)                        [SyncEngine.js ~510]  ← only receives KEY
  ↓ reads value from window._idbCache[key]    [~515-517] NOT from optValue
  ↓
sendBatch([{ key, value }])                   [SyncEngine.js ~399]
  ↓
postSyncPatch({ patches, client_id })         [SyncEngine.js ~334]
  ↓
window.electronAPI.syncPatch(body)            [preload.js ~285] — NOT guardClientMethod-blocked
  ↓
ipcMain.handle('tc-sync-patch')               [main.cjs ~2918]
  ↓ loadNetworkConfig() from disk (tc_network.json)
  ↓
lanPost(apiUrl + 'sync_patch.php', ...)       [main.cjs ~833, ~2931]
  ↓ HTTP POST + X-TC-KEY + X-TC-Client-ID
  ↓
sync_patch.php                                [network-api/sync_patch.php]
  ↓ requireAuth()                             [config.php ~64]
  ↓ tcApplyFullArraySnapshot() (non-chunk)    [merge_records.php ~46]
  ↓ UPSERT kv_store                           [sync_patch.php ~98-201]
  ↓ returns { data: { saved: [...] } }
```

### Main PC learns about it (poll only — no push notification)

```
setInterval(pullFromServer, 2500)             [App.jsx ~6284, CLIENT_PULL_INTERVAL_MS]
  ↓ requires: isNetworkMode && loggedIn && apiUrl
  ↓ counter also requires connStatus !== 'disconnected'  [~6252]
  ↓
loadStateFromServer(apiUrl)                   [SyncEngine.js ~621]
  ↓ renderer fetch (NOT IPC) GET server_state.php
  ↓
server_state.php                              [network-api/server_state.php]
  ↓ SELECT store_key, value FROM kv_store
  ↓ JSON response
  ↓
mergeServerStateWithLocal(_idbCache, data)    [mergeRecordArrays.js ~102]
  ↓ mergeRecordArraysByNewest(local, remote)  (additive by id)
  ↓ applyRecentLocalMembership()              (10s delete guard)
  ↓
_writeMergedServerStateToCache(merged)        [App.jsx ~1071] — bypasses S.set
  ↓
setState(loadState())                         [App.jsx ~6266]
```

---

## STEP 2 — Status at each step

Counter save example:

| Step | Status | Condition if skipped |
|------|--------|----------------------|
| `Customers.jsx` save | **Executed** (on user click) | — |
| `S.set()` | **Executed** unless license/accounting block | `evaluateLicenseStorageWrite` blocked; `validateAccountingMutation` !ok |
| `_coreStorageSet()` | **Executed** if S.set not blocked | — |
| `syncStorageKey()` | **Skipped** if | `window._tcNetRole` not `network_server`/`network_client` [App.jsx ~1255]; `TC_SYNC.syncStorageKey` missing; `getActiveConfig()` null/standalone/no `apiUrl` [SyncEngine ~557-558]; key ∉ `NETWORK_KV_KEYS` [~559]; value null; validate error [~565-566] |
| `syncStorageKeyNow()` | **Skipped** if | same config guards [~512]; key ∉ SYNC_KEY_SET [~513]; cache value null [~517]; validate error [~519]; **`_inflightKeys[key]` already set** [~525] → returns `{ inflight: true }` with **no retry** |
| `electronAPI.syncPatch()` | **Executed** if preload exposes it | Falls back to renderer `fetch` if missing [SyncEngine ~343] |
| IPC `tc-sync-patch` | **Skipped** if | `loadNetworkConfig()` → standalone or no apiUrl [main.cjs ~2920-2921]; empty patches [~2925-2926] |
| `lanPost()` HTTP | **Executed** if IPC runs | timeout 10s [main.cjs ~859] |
| `sync_patch.php` | **Skipped** if | wrong method; no auth (401); key not in `$ALLOWED`; validation fail; dedup duplicate; **write verify strlen mismatch** [~203-209] |
| MySQL `kv_store` | **Updated** only if key ∈ PHP `$saved` response | — |
| Main polling | **Skipped** if | `!loggedIn` [App.jsx ~6251]; `!apiUrl`; client `connStatus === 'disconnected'` [~6252] |
| `mergeServerStateWithLocal` | **Executed** on successful pull | only for keys in `MERGEABLE_RECORD_ARRAY_KEYS` [mergeRecordArrays.js ~5-20] |

---

## STEP 3 — Main PC poll trace (every 2.5 s)

```
useEffect [App.jsx 6249-6290]
  ↓
pullFromServer()
  ↓
loadStateFromServer(systemConfig.apiUrl, null, { authConfig: systemConfig })
  → GET {apiUrl}server_state.php
  → headers: X-TC-KEY from renderer systemConfig.apiKey
  → returns json.data = { tc3_products: [...], tc3_customers: [...], ... }
  ↓
setSyncHydrating(true); setSyncPullPaused(true)
  ↓
mergeServerStateWithLocal(_idbCache, data)
  → per array key: mergeRecordArraysByNewest(local, remote)
  → applyRecentLocalMembership(local, merged, key)  [10 second window]
  ↓
_writeMergedServerStateToCache(merged)
  → _idbCache[k] = v; _idbWrite; localStorage mirror
  → does NOT call syncStorageKey
  ↓
setState(loadState())  → React re-render
  ↓
mirror useEffect → _coreStorageSet (no network sync)
  ↓
setSyncPullPaused(false); setSyncHydrating(false)
```

**Code fact:** Main has **no other mechanism** to see counter changes except this poll (or initial hydrate). There is no WebSocket / server-push.

---

## STEP 4 — Every place sync can stop

### App.jsx

| Location | Condition | Effect |
|----------|-----------|--------|
| `S.set` ~1223-1247 | License read-only / trial limit | Return before `_coreStorageSet` and **before sync** |
| `S.set` ~1255-1256 | `window._tcNetRole` not network role | **No `syncStorageKey` call** |
| Sync init effect ~6166 | `!isNetworkMode \|\| !apiUrl` | Sync engine never starts |
| Sync init effect ~6216-6218 | Pull runs **before** `initSyncEngine` | Engine not armed yet; `S.set` still calls `syncStorageKey` via `TC_SYNC` attached at module load |
| Poll effect ~6251 | `!loggedIn` | **No pull** (push still possible via S.set) |
| Poll effect ~6252 | client `connStatus === 'disconnected'` | **Counter pull stopped** |
| `_writeMergedServerStateToCache` ~1071 | Always on pull | Can overwrite `_idbCache` without pushing |
| Mirror effect ~6806-6828 | Every `state` change | `_coreStorageSet` only — **no sync** (intentional) |

### SyncEngine.js

| Location | Condition | Effect |
|----------|-----------|--------|
| `syncStorageKey` ~557-558 | no config / standalone / no apiUrl | **No push scheduled** |
| `syncStorageKey` ~559 | key ∉ `NETWORK_KV_KEYS` | **No push** |
| `syncStorageKeyNow` ~515-517 | reads **`_idbCache[key]` at push time**, not value from `S.set` | Can push **stale** data if cache changed during 100 ms debounce |
| `syncStorageKeyNow` ~525 | `_inflightKeys[key]` | **Push dropped**, no queue |
| `sendBatch` ~409-427 | server `data.saved` empty | Client treats push as **failed** even if HTTP 200 |
| `postSyncPatch` ~336-343 | IPC error | Falls back to renderer `fetch` |
| `ensureSyncConfig` ~105 | standalone / no apiUrl | Config not set |
| `patchStorageSet` ~695-698 | `__TC_SYNC_DIRECT__ === true` | Wrapper patch **skipped**; relies 100% on explicit `S.set` hook |

### main.cjs

| Location | Condition | Effect |
|----------|-----------|--------|
| `tc-sync-patch` ~2920-2921 | not network mode / no apiUrl | IPC returns `{ success: false }` |
| `lanPost` ~859 | 10 s timeout | Push fails |

### preload.js

| Location | Condition | Effect |
|----------|-----------|--------|
| `syncPatch` ~285 | — | **Not blocked** on client (unlike XAMPP methods) |

### sync_patch.php

| Location | Condition | Effect |
|----------|-----------|--------|
| `requireAuth` | bad/missing `X-TC-KEY` | 401, no write |
| `$ALLOWED` | key not listed | `$failed` |
| `validatePatchValue` | not array | `$failed` |
| `dedup` ~130-137 | duplicate `patch_id` | skipped (auto push sends **no** `patch_id`) |
| merge ~159-164 | `_chunk` vs full | chunk = additive; full = `tcApplyFullArraySnapshot` |
| verify ~203-209 | `strlen(stored) !== strlen($json)` | key **not** in `$saved` |

### server_state.php

| Location | Condition | Effect |
|----------|-----------|--------|
| `requireAuth` | bad key | pull fails |
| missing row in kv_store | — | returns **empty array** for that key [~53-55] |

### merge_records.php / mergeRecordArrays.js

| Location | Condition | Effect |
|----------|-----------|--------|
| `mergeRecordArraysByNewest` | always | **Union by id** — server records not in local are **re-added** on pull |
| `applyRecentLocalMembership` | only if write < **10 s** ago | Filters server-only ids after local edit |
| `tcApplyFullArraySnapshot` (PHP) | non-chunk push | Deletes can propagate **to MySQL** |

### Settings.jsx

| Location | Condition | Effect |
|----------|-----------|--------|
| Upload button ~3485 | user click | `pushKeysToServer(NETWORK_KV_KEYS, { authConfig })` — **bypasses debounce and S.set hook** |

---

## STEP 5 — Proof chain for S.set on syncable keys

**What source code guarantees vs what requires runtime verification:**

| Question | Code answer |
|----------|-------------|
| Is `syncStorageKey()` **designed** to run? | **YES** — if `window._tcNetRole` is network role and `TC_SYNC.syncStorageKey` exists [App.jsx ~1261-1262] |
| Is `syncStorageKeyNow()` **designed** to run? | **YES** — 100 ms after debounce [SyncEngine ~573-576] |
| Is `electronAPI.syncPatch()` **designed** to run? | **YES** — first choice in `postSyncPatch` [~336-337] |
| IPC receive? | **YES** — handler registered [main.cjs ~2918] |
| Main HTTP POST? | **YES** — if IPC preconditions pass |
| PHP receive? | **YES** — if auth + valid body |
| MySQL update? | **ONLY IF** key appears in PHP `$saved` after verify |
| Poll read new data? | **ONLY IF** row actually in `kv_store` and pull runs (`loggedIn`, not disconnected on client) |

**Runtime YES/NO cannot be proven from source alone.** To prove at runtime (without changing code), check after one counter customer save:

1. `Documents/TechonERP/logs/` for `[SyncEngine] network_client pushed [tc3_customers]` [main.cjs ~2937-2939]
2. MySQL: `SELECT updated_at, LENGTH(value) FROM kv_store WHERE store_key='tc3_customers'`

**If logs show no push line → failure is before/during IPC.**  
**If push log exists but MySQL unchanged → PHP rejected/failed verify.**  
**If MySQL changed but main doesn't show → main pull/merge issue.**

---

## STEP 6 — Automatic sync vs Upload Shop Data

| Aspect | Automatic (`S.set` → `syncStorageKey`) | Manual Upload (`Settings.jsx`) |
|--------|----------------------------------------|--------------------------------|
| Entry | `S.set` in pages | Button → `pushKeysToServer` [Settings ~3485] |
| Function | `syncStorageKey` → debounce → `syncStorageKeyNow` | `pushKeysToServer` [SyncEngine ~642] |
| Keys | **One key** per save | **All** `NETWORK_KV_KEYS` with cache data |
| Debounce | **100 ms** | **None** |
| Value source | **`_idbCache[key]` at push time** | **`_idbCache` at button click** |
| HTTP path | `sendBatch` → `postSyncPatch` → IPC → `lanPost` → `sync_patch.php` | **Same** `sendBatch` → `postSyncPatch` |
| Auth | IPC reads `tc_network.json` from disk; fallback fetch uses `getActiveConfig().apiKey` | Temporarily sets `_config` from `systemConfig` prop [~658-664] |
| `patch_id` | **None** | **None** |
| PHP merge | Same `sync_patch.php` logic | Same |
| Pull trigger | `setSyncFlushCallback` after successful `sendBatch` | **No automatic pull** after upload |

### Critical code difference (proven)

`SyncEngine.js` — debounce timer passes only the key:

```javascript
_keyDebounceTimers[key] = setTimeout(function () {
  delete _keyDebounceTimers[key];
  delete _pending[key];
  syncStorageKeyNow(key);   // ← only key passed; value NOT passed
}, delay);
```

`SyncEngine.js` — push re-reads cache at execution time:

```javascript
const cache = (typeof window !== 'undefined' && window._idbCache) ? window._idbCache : {};
const value = cache[key];   // ← re-reads cache at push time
```

Manual upload reads cache once at click and sends **all keys in one batch** — no debounce, no stale single-key re-read window.

---

## STEP 7 — MySQL after counter saves one customer

**From code alone: CANNOT answer YES/NO** — requires live MySQL query.

**What code says must happen for YES:**

1. Counter `S.set` → `syncStorageKey` not skipped
2. `syncStorageKeyNow` pushes current `_idbCache.tc3_customers`
3. `sync_patch.php` includes `tc3_customers` in `$saved`
4. `kv_store` row updated

**If NO, code-proven blockers (in order of check):**

1. `window._tcNetRole` not `network_client` on counter
2. `getActiveConfig()` missing `apiUrl`
3. `_inflightKeys` drop
4. Push sends **stale cache** (missing new customer)
5. PHP auth failure (401)
6. PHP write verification failure → not in `$saved`
7. IPC `tc-sync-patch` returns `Not in network mode`

---

## STEP 8 — Delete quotation reappear (~2–3 s)

### Trace

```
Invoices.jsx deleteQ()                        [~361-365]
  ↓
nq = quotations.filter(id !== deleted)
  ↓
S.set("tc3_quotations", nq)
  ↓
syncStorageKey("tc3_quotations", nq)          [100 ms debounce]
  ↓
syncStorageKeyNow → reads _idbCache (may be stale)
  ↓
sync_patch.php → tcApplyFullArraySnapshot     [should remove id from MySQL IF push succeeds with full array]
  ↓
~2.5 s later: pullFromServer()                [CLIENT_PULL_INTERVAL_MS = 2500]
  ↓
mergeRecordArraysByNewest(local, remote)      [ADDITIVE — re-imports server ids]
  ↓
applyRecentLocalMembership                    [only if _tcRecentLocalWrites < 10s]
  ↓
_writeMergedServerStateToCache → setState
  ↓
Deleted quotation visible again
```

### Why ~2.5 s matches code

```javascript
export const CLIENT_PULL_INTERVAL_MS = 2500;  // SyncEngine.js
```

### Why delete returns (code-proven)

1. **Pull merge is additive** — `mergeRecordArraysByNewest` keeps any record still on server (ingests local, then remote).
2. **Delete only sticks on server if push writes full snapshot without that id** — `tcApplyFullArraySnapshot` in PHP (`merge_records.php`, `sync_patch.php`).
3. **If push fails or pushes stale cache (still containing deleted row), server unchanged.**
4. **Local protection is only 10 seconds** via `applyRecentLocalMembership`. S.set sets `_tcRecentLocalWrites` [App.jsx ~1258]. At 2.5 s this should still filter server-only deleted id **if local cache still has filtered `nq` at merge time**.
5. **Reappear at 2–3 s therefore implies:** either (a) server still has the quotation because **push did not update MySQL**, and merge re-adds it while **local cache at merge time already matches server** (also stale), or (b) `_tcRecentLocalWrites` protection did not apply (not network role at `S.set`), or (c) pull overwrote local with server copy via `_writeMergedServerStateToCache` after merge included server row.

---

## FINAL REPORT — Root causes

Ordered from **most likely** to **least likely**. Evidence from source code only.

### ROOT CAUSE #1 — Debounced push re-reads `_idbCache` instead of the value from `S.set`, racing with 2.5 s pull

**Evidence:**

- `syncStorageKey(k, v)` stores `v` in `_pending` but timer calls `syncStorageKeyNow(key)` **without `v`** [SyncEngine.js ~573-576].
- `syncStorageKeyNow` reads `window._idbCache[key]` at execution time [~515-517].
- Pull every 2.5 s calls `_writeMergedServerStateToCache` which overwrites `_idbCache` from server merge [App.jsx ~1071-1078, ~6264-6266].
- Manual upload works because `pushKeysToServer` reads cache **once** at user action and sends all keys [SyncEngine.js ~650-661, Settings.jsx ~3485].

**Explains:** Main→counter only after manual upload; counter→main never; automatic appears broken while manual recovery works.

---

### ROOT CAUSE #2 — Pull merge is additive; server remains source of truth when push does not update `kv_store`

**Evidence:**

- `mergeServerStateWithLocal` → `mergeRecordArraysByNewest` unions local + remote by id [mergeRecordArrays.js ~27-55, ~102-116].
- Poll interval 2500 ms [SyncEngine.js ~56].
- Delete reappear: server row re-merged into local if not removed from MySQL [merge_records.php ~46-72 only on successful non-chunk push].

**Explains:** Quotation reappears in ~2–3 s; counter never sees main changes until bulk upload fills MySQL.

---

### ROOT CAUSE #3 — Push success requires PHP `data.saved` confirmation; failures are silent in UI

**Evidence:**

- `sendBatch` only marks keys synced if in `json.data.saved` or `duplicates` [SyncEngine.js ~409-427].
- PHP can reject via write verification `strlen` mismatch [sync_patch.php ~203-209] → key ∉ `$saved`.
- `syncStorageKeyNow` logs via `writeLog` IPC only; no user-visible error [SyncEngine.js ~544-545].
- `_inflightKeys` drop returns `{ inflight: true }` with no retry [~525-526].

**Explains:** Intermittent push failure with no UI feedback; logs may show `Server did not confirm save` or no `[SyncEngine]` line.

---

## Minimum runtime proof (no code changes)

After **one** counter customer save:

```sql
SELECT store_key, updated_at, LENGTH(value) 
FROM kv_store 
WHERE store_key = 'tc3_customers';
```

And in `Documents/TechonERP/logs/` search for:

```
[SyncEngine] network_client pushed [tc3_customers]
```

That single pair of checks proves whether failure is **before MySQL** or **at pull/merge**.

---

## What this investigation did NOT do

- No runtime tests, log inspection, or MySQL queries were run.
- No assumption about deployed PHP on `C:\xampp\htdocs\api\` vs repo — repo code includes `tcApplyFullArraySnapshot`; if deployed copy differs, behavior differs (environment check, not visible in renderer JS alone).

---

## Key source files referenced

| File | Role |
|------|------|
| `erp-app/src/pages/Customers.jsx` | Customer save → `S.set` |
| `erp-app/src/pages/Invoices.jsx` | Quotation delete → `S.set` |
| `erp-app/src/App.jsx` | `S.set`, poll, merge apply, mirror effect |
| `erp-app/src/sync/SyncEngine.js` | Push/pull engine |
| `erp-app/src/utils/mergeRecordArrays.js` | Client-side merge on pull |
| `erp-app/src/pages/Settings.jsx` | Manual `pushKeysToServer` |
| `erp-app/main.cjs` | `tc-sync-patch` IPC, `lanPost` |
| `erp-app/preload.js` | `electronAPI.syncPatch` |
| `erp-app/network-api/sync_patch.php` | Server write path |
| `erp-app/network-api/server_state.php` | Server read path |
| `erp-app/network-api/merge_records.php` | Server array merge / full snapshot |

---

*End of investigation report.*
