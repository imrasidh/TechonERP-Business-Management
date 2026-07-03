# TechonERP Diagnostic Build Report

**Date:** 2026-07-03  
**Version:** 2.0.0 (diagnostic logging only — no bug fixes)  
**Purpose:** Capture one complete Customer Save → sync execution trace on Counter PC.

---

## What Was Done

A **temporary diagnostic build** was created. **No business logic changed. No sync logic changed.** Only logging was added.

Each Customer save on Counter PC writes **one numbered execution trace** to:

```
%USERPROFILE%\Documents\TechonERP\logs\sync_trace.log
```

---

## Installer Location

| Artifact | Path |
|---|---|
| NSIS installer | `erp-app\release\Techon-ERP Setup 2.0.0.exe` |
| Unpacked exe | `erp-app\release\win-unpacked\Techon-ERP.exe` |

Install this build on **Counter PC** (replaces previous install).

---

## Files Added / Modified (logging only)

| File | Change |
|---|---|
| `erp-app/src/utils/syncTraceLog.js` | **NEW** — trace session API, context dump, STOPPED HERE / COMPLETE |
| `erp-app/preload.js` | `electronAPI.writeSyncTrace` IPC |
| `erp-app/main.cjs` | `writeSyncTraceFile()`, `tc-write-sync-trace` IPC, main-process steps in `tc-sync-patch` |
| `erp-app/src/pages/Customers.jsx` | `beginCustomerSaveTrace()` on Save / Save Changes |
| `erp-app/src/App.jsx` | Trace steps inside `S.set` + `_idbWrite` for `tc3_customers` |
| `erp-app/src/sync/SyncEngine.js` | Trace in `syncStorageKey`, `syncStorageKeyNow`, `sendBatch`, `postSyncPatch` |

---

## Trace Steps Logged (example sequence)

When you save **one customer**, the log should contain lines like:

```
========== CUSTOMER SAVE TRACE BEGIN cust-2026-07-03T... (DIAGNOSTIC BUILD) ==========
[1] Customer Save clicked (handler=saveNew)
--- CONTEXT ---
process=renderer
role=network_client
apiUrl=http://192.168.8.112/api/
apiKeyExists=true
configSource=window._tcNetSyncConfig
window.__TC_SYNC_DIRECT__=true
window._tcNetRole=network_client
...
--- END CONTEXT ---
[2] saveNew()
[3] S.set("tc3_customers", nc) calling count=N
[4] S.set("tc3_customers") entered
[5] _coreStorageSet()
[6] IndexedDB write complete (tc3_customers)
[7] _mirrorTc3ToLocalStorage() complete
[8] window._tcNetRole = network_client
[9] ensureSyncConfig(window._tcSystemConfig)
[10] syncStorageKey() calling key=tc3_customers
[11] syncStorageKey() entered key=tc3_customers
[12] getActiveConfig() in syncStorageKey = role=network_client apiUrl=...
[13] debounce scheduled delayMs=100
[14] debounce fired → syncStorageKeyNow()
[15] syncStorageKeyNow() key=tc3_customers
[16] getActiveConfig() = role=network_client apiUrl=...
[17] sendBatch() keys=[tc3_customers] groups=1
[18] postSyncPatch() keys=[tc3_customers]
[19] electronAPI.syncPatch() calling
[20] main.cjs received tc-sync-patch IPC keys=[tc3_customers]
[21] lanPost() HTTP POST http://192.168.8.112/api/sync_patch.php
[22] HTTP response success=true message=...
[23] electronAPI.syncPatch() returned success=true
[24] sendBatch success savedKeys=[tc3_customers]
[25] TRACE COMPLETE — SUCCESS (server confirmed tc3_customers)
========== CUSTOMER SAVE TRACE END cust-... ==========
```

If execution stops, you will see:

```
[N] STOPPED HERE
Reason: ...
Exception: ...
Stack trace: ...
========== CUSTOMER SAVE TRACE END ... (STOPPED) ==========
```

---

## Context Fields Logged (every trace)

| Field | Where |
|---|---|
| `role` | renderer + main |
| `apiUrl` | renderer + main |
| `apiKeyExists` true/false | renderer + main |
| `configSource` | renderer (`window._tcNetSyncConfig` / `window._tcSystemConfig`) / main (`loadNetworkConfig()`) |
| `process` | `renderer` or `main` |
| `window.__TC_SYNC_DIRECT__` | renderer |
| `window._tcNetRole` | renderer |
| `window._tcNetSyncConfig` | renderer (role, apiUrl, apiKeyExists — key value not logged) |

---

## Your Test Procedure

1. Copy `erp-app\release\Techon-ERP Setup 2.0.0.exe` to Counter PC.
2. Install (over existing Techon ERP).
3. Open app, log in as Counter (`network_client`).
4. Go to **Customers** → **+ Add Customer** → fill name → **Save** (one customer only).
5. Wait **2–3 seconds** (debounce is 100ms for customers; allow HTTP to finish).
6. Open log file:

   ```
   C:\Users\<YOU>\Documents\TechonERP\logs\sync_trace.log
   ```

7. Send the **last trace block** (from `CUSTOMER SAVE TRACE BEGIN` through `TRACE END`).

---

## How to Open Logs Folder on Counter

- File Explorer → `%USERPROFILE%\Documents\TechonERP\logs\`
- Or in Techon ERP: Settings → open logs folder (if available on client)

Regular app logs still go to `techon-YYYY-MM-DD.log`. **Sync trace is only in `sync_trace.log`.**

---

## What This Build Does NOT Do

- Does not fix sync
- Does not change debounce, merge, pull, or push logic
- Does not change Customer save behavior
- Does not log every `S.set` — only **Customer page saves** (`saveNew` / `saveEditCust`)

---

## After Debugging

Remove diagnostic code:

- Delete `src/utils/syncTraceLog.js`
- Revert trace imports/calls in `Customers.jsx`, `App.jsx`, `SyncEngine.js`
- Revert `preload.js` and `main.cjs` sync trace IPC
- Rebuild production installer

---

## Build Verification (this machine)

| Step | Result |
|---|---|
| `npm run build` | Success |
| `npm run dist` | Success → `Techon-ERP Setup 2.0.0.exe` |

---

## Next Step

Install on Counter → save **one** customer → send `sync_trace.log` (last trace block). The log will show the **exact step** where execution stops, if sync still fails.
