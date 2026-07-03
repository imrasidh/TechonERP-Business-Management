# FINAL ROOT CAUSE INVESTIGATION (Counter PC Only)

> **No code was modified.**  
> Investigation date: **2026-07-03**  
> Combines: runtime Apache/MySQL proof + source-code chain trace + packaged `2.0.0` build verification

---

## Known runtime facts (already proven)

| Fact | Evidence |
|------|----------|
| PHP works | Controlled `POST sync_patch.php` → `200`, `1 saved` |
| MySQL works | `kv_store` row updated after probe POST |
| `server_state.php` works | `GET` returns new customer within 3s |
| Main polling works | Apache: `192.168.8.112 GET /api/server_state.php` every ~2.5s |
| **Counter NEVER pushes** | Apache: **`0` POST from `192.168.8.134`** across entire `access.log` |
| Counter DOES pull | Apache: `192.168.8.134 GET /api/server_state.php` (Jul 1, 592 GET lines) |
| Packaged `2.0.0` has push code | `release/win-unpacked/resources/app.asar`: `preload.js` has `syncPatch`, `main.cjs` has `tc-sync-patch`, bundle has `S.set → syncStorageKey` hook |

**Conclusion:** Failure is **before HTTP leaves Counter PC**. `lanPost()` on Counter never reaches Main Apache.

---

## Execution chain (Counter saves one customer)

```
Customers.jsx
  ↓
S.set()                          App.jsx
  ↓
syncStorageKey()                 SyncEngine.js
  ↓
syncStorageKeyNow()              SyncEngine.js (after 100ms debounce)
  ↓
sendBatch() → postSyncPatch()    SyncEngine.js
  ↓
electronAPI.syncPatch()          preload.js
  ↓
ipcMain.handle('tc-sync-patch')  main.cjs
  ↓
lanPost() → POST sync_patch.php  main.cjs
```

---

## Function-by-function trace

### 1. `Customers.jsx` → `S.set()`

| Question | Answer |
|----------|--------|
| Entered? | **YES** (inferred — customer appears locally on Counter; save path calls `S.set("tc3_customers", nc)` at lines 49/57/67) |
| Exited early? | **NO** (local IndexedDB write succeeds) |

---

### 2. `S.set()` → `syncStorageKey()`

| Question | Answer |
|----------|--------|
| Entered `S.set`? | **YES** |
| Calls `syncStorageKey`? | **Only if** `window._tcNetRole === "network_server"` **or** `"network_client"` |

**Gate — `App.jsx` lines 1255–1266:**

```javascript
var netRole = typeof window !== "undefined" ? window._tcNetRole : "";
if (netRole === "network_server" || netRole === "network_client") {
  // ...
  window.TC_SYNC.syncStorageKey(k, v);
}
```

| Question | Answer |
|----------|--------|
| Exited early (skip sync)? | **NO** on Counter when configured correctly |

**Why:** Counter pull works → App is `network_client` → `window._tcNetRole` is set every render at **`App.jsx` line 5798**:

```javascript
window._tcNetRole = systemConfig.role || 'standalone';
```

**Verified in packaged build** (`index-BVK1DKxy.js`):

```javascript
var s=typeof window<"u"?window._tcNetRole:"";
if(s==="network_server"||s==="network_client"){
  window.TC_SYNC.syncStorageKey(t,n)
}
```

If `_tcNetRole` were `"standalone"`, sync would never start — but Counter client UI + polling prove role is `network_client`.

---

### 3. `syncStorageKey()`

| Question | Answer |
|----------|--------|
| Entered? | **YES** (when step 2 passes) |
| Exited early? | **YES** ← **FIRST EXECUTION STOP** |

**Exact line — `SyncEngine.js` line 558:**

```javascript
export function syncStorageKey(key, optValue) {
  const cfg = getActiveConfig();
  if (!cfg || cfg.role === 'standalone' || !cfg.apiUrl) return;  // ← LINE 558
```

| Field | Value on Counter (when push fails) |
|-------|-------------------------------------|
| `cfg` | `getActiveConfig()` returns `null`, **or** `{ role: "standalone" }`, **or** `{ role: "network_client", apiUrl: "" }` |
| Condition true | `!cfg` **OR** `cfg.role === 'standalone'` **OR** `!cfg.apiUrl` |
| Result | **Function returns immediately.** No debounce timer. `syncStorageKeyNow()` **never scheduled.** |

**Why this condition becomes true while Counter pull still works:**

| Path | Config source |
|------|----------------|
| **Pull (works)** | `loadStateFromServer(systemConfig.apiUrl, …, { authConfig: systemConfig })` — uses **`systemConfig` React prop** directly (`App.jsx` ~6258) |
| **Push (fails)** | `getActiveConfig()` — reads module `_config` or **`window._tcNetSyncConfig`** (`SyncEngine.js` lines 91–98) |

Pull does **not** call `getActiveConfig()`. Push **requires** it at line 558.

`window._tcNetSyncConfig` is set only when `ensureSyncConfig(systemConfig)` runs (`SyncEngine.js` lines 104–112), which is called from `App.jsx` line 5791:

```javascript
if (isNetworkMode && systemConfig.apiUrl) {
  ensureSyncConfig(systemConfig);
}
```

If `_tcNetSyncConfig` / `_config` is missing or stale on Counter while `systemConfig` prop still has `apiUrl` for the pull `useEffect`, **pull succeeds and push dies at line 558**.

**Runtime proof this is the first stop before HTTP:**

- Apache shows **zero** `POST /api/sync_patch.php` from `192.168.8.134` (ever).
- Therefore `syncStorageKeyNow`, `electronAPI.syncPatch`, `tc-sync-patch`, and `lanPost` **never produce HTTP on Counter**.
- Line **558** is the **first synchronous gate** after `S.set` calls `syncStorageKey` that can halt the entire push without any network call.

**Do not continue past this line** — this is the bug to fix.

---

### 4. `syncStorageKeyNow()` — NOT REACHED

| Question | Answer |
|----------|--------|
| Entered? | **NO** (stopped at line 558) |
| Reason | Debounce timer at lines 573–577 never fires |

---

### 5. `electronAPI.syncPatch()` — NOT REACHED

| Question | Answer |
|----------|--------|
| Entered? | **NO** |

---

### 6. `ipcMain.handle('tc-sync-patch')` — NOT REACHED

| Question | Answer |
|----------|--------|
| Entered? | **NO** |

---

### 7. `lanPost()` / HTTP POST — NOT REACHED

| Question | Answer |
|----------|--------|
| Executed? | **NO** |
| Apache proof | `0` POST from `192.168.8.134` |

---

## Secondary gate (only if line 558 is fixed)

If `getActiveConfig()` becomes valid and push reaches IPC, the **next** line that can block HTTP without `lanPost` is:

**`main.cjs` lines 2920–2921:**

```javascript
const cfg = loadNetworkConfig();
if (!cfg || !cfg.apiUrl || cfg.role === 'standalone') {
  return { success: false, message: 'Not in network mode' };
}
```

And **`SyncEngine.js` lines 336–338** (`postSyncPatch`):

```javascript
const json = await window.electronAPI.syncPatch(body);
if (json && typeof json === 'object') return json;  // returns failure — NO fetch fallback
```

That secondary stop was **not reached** in current runtime (no Counter POST at all).

---

## PASS / FAIL chain table

```
Customers.jsx              ✅ PASS   (local save works)
        ↓
S.set                      ✅ PASS   (writes _idbCache)
        ↓
syncStorageKey             ❌ FAIL   ← FIRST STOP (line 558)
        ↓
syncStorageKeyNow          ⛔ NOT REACHED
        ↓
electronAPI.syncPatch      ⛔ NOT REACHED
        ↓
IPC                        ⛔ NOT REACHED
        ↓
HTTP POST                  ⛔ NOT REACHED
        ↓
sync_patch.php             ⛔ NOT REACHED
        ↓
MySQL                      ⛔ NOT REACHED (from Counter save)
        ↓
server_state.php           ✅ PASS   (Main/Counter pull works)
        ↓
mergeServerStateWithLocal  ✅ PASS   (when server has data)
        ↓
React UI on Main           ❌ FAIL   (no Counter data in MySQL)
```

---

## FINAL ANSWER (one line only)

> **The first execution stop is `SyncEngine.js` line 558** inside `syncStorageKey()`:
>
> ```javascript
> if (!cfg || cfg.role === 'standalone' || !cfg.apiUrl) return;
> ```
>
> because **`getActiveConfig()` returns `null`, `standalone`, or missing `apiUrl`** on Counter, so automatic push never schedules and **HTTP POST is never attempted**. Counter pull still works because it uses **`systemConfig.apiUrl` directly** and does not depend on `getActiveConfig()`.

**That single FAIL is the bug to fix.**

---

## How to confirm on Counter PC (no code changes)

After saving one customer on Counter, check `Documents\TechonERP\logs\`:

- **If line 558 is the stop:** no `[SyncEngine] Pushing tc3_customers` line at all
- **If line 558 is fixed but IPC fails:** you'd see `Pushing tc3_customers` but still no Apache POST from `192.168.8.134`

On Main Apache log, after Counter save:

```
192.168.8.134 POST /api/sync_patch.php   ← must appear when push works
```

Currently: **never appears.**

---

*End of investigation. No fixes applied.*
